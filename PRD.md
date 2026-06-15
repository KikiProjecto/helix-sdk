# PRD.md — Product Requirements Document
## Helix SDK: Complete Technical Specification

---

## 1. PACKAGE SPECIFICATIONS

### 1.1 @helix-sdk/core

The foundational package. Zero dependencies on proprietary services.

#### RpcPool

```typescript
interface RpcPoolConfig {
  endpoints: readonly EndpointConfig[];
  healthCheckIntervalMs?: number;         // default: 5000
  healthCheckTimeoutMs?: number;          // default: 2000
  degradedLatencyThresholdMs?: number;    // default: 1500
  unhealthyErrorRateThreshold?: number;   // default: 0.2 (20%)
  maxConcurrentRequests?: number;         // default: 10 per endpoint
}

interface EndpointConfig {
  url: string;
  wsUrl?: string;
  weight?: number;                        // default: 1.0
  priority?: number;                      // lower = tried first
  rateLimitRps?: number;                  // requests per second ceiling
  tags?: readonly string[];               // e.g. ['mainnet', 'staked']
}

interface EndpointHealth {
  url: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  errorRate1m: number;
  successRate1m: number;
  lastCheckAt: Date;
  consecutiveFailures: number;
}
```

**Routing Algorithm:**
1. Filter pool to `healthy` endpoints only
2. Sort by: priority ASC, then latencyP50 ASC
3. If all healthy endpoints fail, admit `degraded` endpoints
4. If all fail, attempt `unhealthy` endpoints once with 2s timeout
5. Emit `pool.failover` event with endpoint change details

**Health Check Logic:**
```
Every healthCheckIntervalMs:
  For each endpoint:
    Send getSlot() with healthCheckTimeoutMs timeout
    If success: record latency, decrement consecutiveFailures
    If failure: increment consecutiveFailures
    If consecutiveFailures >= 3: mark 'unhealthy'
    If latency > degradedLatencyThresholdMs: mark 'degraded'
    Emit metrics: helix.pool.latency, helix.pool.health_status
```

#### FallbackChain

```typescript
interface FallbackChainConfig {
  retryPolicy: RetryPolicyConfig;
  onEndpointFail?: (endpoint: string, error: HelixError) => void;
  onFallback?: (from: string, to: string) => void;
  onExhausted?: (attempts: number, lastError: HelixError) => void;
}

interface RetryPolicyConfig {
  maxAttempts: number;              // default: 5
  initialDelayMs: number;           // default: 100
  maxDelayMs: number;               // default: 10_000
  backoffMultiplier: number;        // default: 2.0
  jitterFactor: number;             // default: 0.25 (adds ±25% jitter)
  retryableErrors: readonly string[];  // error codes that trigger retry
}
```

**Retry Math:**
```
delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay)
jitter = delay * jitterFactor * (Math.random() * 2 - 1)
actualDelay = delay + jitter
```

**Retryable Error Codes:**
- `ECONNREFUSED` — server not listening
- `ECONNRESET` — connection dropped mid-request
- `ETIMEDOUT` — request timeout
- `HTTP_429` — rate limited
- `HTTP_503` — service unavailable
- `SolanaBlockhashNotFound` — stale blockhash (rebuild tx)
- `SolanaSlotSkipped` — skip to next attempt

**Non-Retryable (surface to caller immediately):**
- `HTTP_400` — malformed request (bug in SDK or caller code)
- `SolanaInstructionError` — on-chain logic rejected tx
- `SolanaSignatureVerificationFailed` — corrupted signature
- `ABORT_ERR` — caller cancelled via AbortSignal

#### HelixRpcClient

```typescript
interface HelixRpcClient {
  // Drop-in replacement for createSolanaRpc result
  getLatestBlockhash(commitment?: Commitment): Promise<BlockhashWithExpiryBlockHeight>;
  getSlot(commitment?: Commitment): Promise<Slot>;
  getBalance(address: Address, commitment?: Commitment): Promise<Lamports>;
  sendTransaction(tx: Base64EncodedWireTransaction, options?: SendOptions): Promise<Signature>;
  getSignatureStatuses(signatures: readonly Signature[]): Promise<SignatureStatusesResult>;
  simulateTransaction(tx: TransactionMessage, options?: SimulateOptions): Promise<SimulationResult>;
  getRecentPrioritizationFees(programIds?: Address[]): Promise<PrioritizationFee[]>;
  
  // Helix-enhanced methods
  sendAndConfirmTransaction(tx: SignedTransaction, options?: ConfirmOptions): Promise<Signature>;
  getHealthStatus(): PoolHealthStatus;
  getMetrics(): MetricsSnapshot;
  
  // Lifecycle
  destroy(): Promise<void>;
}
```

#### TransactionSender

```typescript
interface TransactionSenderConfig {
  confirmationTimeout?: number;         // default: 60_000ms
  confirmationRetries?: number;         // default: 3
  resendIntervalMs?: number;            // default: 5_000 (resend same tx while waiting)
  onConfirmation?: (sig: Signature, slot: number) => void;
  onRetry?: (attempt: number, reason: string) => void;
  onBlockhashExpiry?: () => void;       // fired when tx must be rebuilt
}
```

**Transaction Confirmation Flow:**
```
1. Send transaction
2. Subscribe to WebSocket signature notification (if available)
3. SIMULTANEOUSLY: poll getSignatureStatuses every 2s
4. Resend same signed tx every resendIntervalMs (idempotent, same signature)
5. If blockheightExceedsByLatestBlockhash → fire onBlockhashExpiry, return error
6. If WebSocket confirms → cancel polling, return
7. If timeout → throw HelixTransactionTimeoutError with signature
```

#### BlockhashCache

```typescript
interface BlockhashCacheConfig {
  ttlSlots?: number;                    // default: 100 (of 150 max)
  prefetchThresholdSlots?: number;      // default: 50 (prefetch when 50 slots remain)
  commitment?: Commitment;              // default: 'confirmed'
}
```

**Cache Strategy:**
- Cache blockhash with its `lastValidBlockHeight`
- Background refresh when current slot > (lastValidBlockHeight - prefetchThresholdSlots)
- Never return a blockhash with <20 slots remaining
- Emit `helix.blockhash.cache_hit` and `helix.blockhash.cache_miss` metrics

---

### 1.2 @helix-sdk/jito

#### JitoClient

```typescript
interface JitoClientConfig {
  endpoint?: JitoEndpoint;              // default: 'mainnet'
  allEndpoints?: boolean;               // try all regions in parallel
  minTipLamports?: bigint;              // default: 1_000n
  maxTipLamports?: bigint;              // default: 100_000n
  tipMode?: 'fixed' | 'dynamic';       // dynamic = from tip oracle
  bundleTimeout?: number;               // default: 30_000ms
  rpcFallback?: HelixRpcClient;        // fall back to this on Jito failure
}

type JitoEndpoint = 
  | 'mainnet'
  | 'ny'
  | 'amsterdam'
  | 'frankfurt'
  | 'tokyo'
  | 'dallas';

interface JitoBundle {
  transactions: readonly Base64EncodedWireTransaction[];
  tipAccountAddress: Address;
  tipLamports: bigint;
}

interface BundleResult {
  bundleId: string;
  status: 'accepted' | 'rejected' | 'timeout';
  slot?: number;
  error?: string;
}
```

**Bundle Construction Flow:**
```
1. Call getTipAccounts() → get 1 of 8 tip accounts (random selection)
2. Determine tip amount:
   - fixed mode: use config.minTipLamports
   - dynamic mode: fetch from TipOracle, clamp to [min, max]
3. Create tip instruction: SystemProgram.transfer(signer, tipAccount, tipLamports)
4. Append tip instruction to last transaction in bundle
5. Submit bundle to Jito block engine
6. Poll getBundleStatuses() with exponential backoff
7. If timeout → invoke rpcFallback.sendTransaction()
8. Emit: helix.jito.bundle_submitted, helix.jito.bundle_landed, helix.jito.bundle_dropped
```

#### TipOracle

Sources tip recommendations from Jito's getRecentBlockhash variant plus historical bundle data:
- Minimum: 1,000 lamports
- P25: cheapest that lands 75% of the time
- P50: recommended for standard priority
- P75: high priority (lands in current slot usually)
- P95: urgent (next 1-2 slots)

---

### 1.3 @helix-sdk/fees

#### FeeOracle

```typescript
interface FeeOracleConfig {
  providers?: readonly FeeProvider[];   // default: [helius, native]
  fallbackMode?: 'cascade' | 'median'; // cascade = try in order; median = average all
  cacheTtlMs?: number;                  // default: 5_000
  maxMicrolamportsPerCu?: number;       // hard cap, default: 1_000_000
  minMicrolamportsPerCu?: number;       // floor, default: 1_000
}

interface FeeEstimate {
  microlamportsPerCu: number;
  estimatedLamportsCost: bigint;
  source: string;
  confidence: 'low' | 'medium' | 'high';
  computeUnitsEstimate?: number;
}
```

**Fee Sources (in priority order):**
1. **Helius Priority Fee API**: `POST /v0/getPriorityFeeEstimate` with account keys. Returns per-account fee recommendation. Highest accuracy.
2. **Solana Native**: `getRecentPrioritizationFees([...programIds])`. Returns last 150 slots of fee data. Compute median of recent fees.
3. **Static Fallback**: Return 5,000 microlamports/CU (conservative but reliable).

#### ComputeBudgetBuilder

```typescript
// Builds the two mandatory compute budget instructions:
function buildComputeBudgetInstructions(estimate: FeeEstimate): {
  setComputeUnitLimit: TransactionInstruction;   // prevents over-billing
  setComputeUnitPrice: TransactionInstruction;   // priority fee
}
```

**Compute Unit Strategy:**
```
1. Simulate transaction with simulated CU limit of 1,400,000 (max)
2. Read simulation.value.unitsConsumed
3. Apply 10% buffer: budgetedUnits = ceil(unitsConsumed * 1.1)
4. Clamp to [1_000, 1_400_000]
5. SetComputeUnitLimit to budgetedUnits
6. SetComputeUnitPrice to feeOracle.estimate(programIds) microlamports
```

---

### 1.4 @helix-sdk/wallet-adapter

```typescript
interface HelixWalletAdapterPlugin {
  wrap<T extends StandardWalletAdapter>(adapter: T): HelixEnhancedWalletAdapter;
}

interface HelixEnhancedWalletAdapter extends StandardWalletAdapter {
  // All standard wallet adapter methods, enhanced with:
  // - Automatic retry on sendTransaction
  // - Dynamic fee injection
  // - Jito routing if configured
  // Original methods preserved and accessible via .original
  original: T;
}
```

**Integration Pattern:**
```typescript
// In wallet provider setup:
import { HelixWalletAdapterPlugin } from '@helix-sdk/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

const helix = new HelixWalletAdapterPlugin({ client: helixClient });
const phantomAdapter = new PhantomWalletAdapter();
const enhancedPhantom = helix.wrap(phantomAdapter);

// enhancedPhantom.sendTransaction() now automatically:
// 1. Estimates and injects compute budget instructions
// 2. Routes via Jito first, RPC fallback
// 3. Retries on network failure
// 4. Emits OTel metrics
```

---

### 1.5 @helix-sdk/observability

#### Metric Definitions (complete list)

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `helix.rpc.latency_ms` | Histogram | endpoint, method | Per-endpoint per-method latency |
| `helix.rpc.requests_total` | Counter | endpoint, method, status | Total RPC calls |
| `helix.rpc.errors_total` | Counter | endpoint, method, error_code | Errors by code |
| `helix.rpc.error_rate` | Gauge | endpoint | Rolling 1m error rate |
| `helix.rpc.success_rate` | Gauge | endpoint | Rolling 1m success rate |
| `helix.tx.sent_total` | Counter | method | Total transactions sent |
| `helix.tx.confirmed_total` | Counter | commitment | Confirmed by commitment level |
| `helix.tx.dropped_total` | Counter | reason | Dropped transactions + reason |
| `helix.tx.confirmation_time_ms` | Histogram | commitment | Time to confirmation |
| `helix.tx.retry_count` | Histogram | — | Retries needed per successful tx |
| `helix.jito.bundle_submitted` | Counter | endpoint | Jito bundles submitted |
| `helix.jito.bundle_landed` | Counter | endpoint | Jito bundles confirmed |
| `helix.jito.bundle_dropped` | Counter | endpoint | Jito bundles dropped |
| `helix.jito.tip_lamports` | Histogram | — | Tip amounts paid |
| `helix.fees.estimate_microlamports` | Histogram | source | Fee estimates returned |
| `helix.fees.cu_budget` | Histogram | — | Compute unit limits set |
| `helix.pool.healthy_nodes` | Gauge | — | Count of healthy pool nodes |
| `helix.pool.degraded_nodes` | Gauge | — | Count of degraded pool nodes |
| `helix.pool.failover_total` | Counter | from, to | Pool failover events |
| `helix.blockhash.cache_hit` | Counter | — | Blockhash served from cache |
| `helix.blockhash.cache_miss` | Counter | — | Blockhash fetched from RPC |

#### OTel Span Structure

Every RPC call is wrapped in an OTel span:
```
helix.rpc.call
  attributes:
    rpc.system: "solana"
    rpc.method: "sendTransaction"
    rpc.endpoint: "https://..."
    net.peer.name: hostname
    helix.attempt: 1
    helix.pool.position: 0
    outcome: "success" | "error" | "retry"
  events:
    - "retry" (on each retry)
    - "fallback" (on endpoint switch)
    - "confirmed" (when tx lands)
```

#### Exporter Configuration

```typescript
interface ObservabilityConfig {
  otel?: {
    enabled: boolean;
    endpoint?: string;                  // OTel collector endpoint
    headers?: Record<string, string>;   // auth headers
    exportIntervalMs?: number;          // default: 10_000
    resource?: {
      serviceName: string;
      serviceVersion?: string;
      environment?: string;
    };
  };
  datadog?: {
    enabled: boolean;
    apiKey: string;
    site?: string;                      // default: 'datadoghq.com'
    service?: string;
    env?: string;
    tags?: Record<string, string>;
  };
  prometheus?: {
    enabled: boolean;
    port?: number;                      // default: 9090
    path?: string;                      // default: '/metrics'
  };
}
```

---

### 1.6 @helix-sdk/diagnostics (CLI)

**Binary name:** `helix-diag`
**Built with:** Commander.js + Ink (React for terminal)

#### Commands

```bash
# Health check a single endpoint
helix-diag check <endpoint-url>
  --timeout 2000        # ms
  --count 10            # number of pings
  --commitment confirmed
  Output: latency table (min/p50/p95/p99/max), slot, status

# Test full pool with failover simulation
helix-diag pool <endpoint1> [endpoint2] [endpoint3...]
  --simulate-failures   # randomly drop endpoints to test failover
  Output: pool health grid, failover events, recommendation

# Send a test transaction on devnet
helix-diag tx
  --rpc <endpoint>
  --keypair <path-to-keypair.json>
  --network devnet
  Output: tx signature, slot, confirmation time, fees paid

# Test Jito integration
helix-diag jito
  --endpoint mainnet|ny|frankfurt|amsterdam|tokyo
  Output: tip accounts, tip recommendation, bundle simulation result

# Dump current metrics
helix-diag metrics
  --format json|table|prometheus
  Output: all helix.* metrics at current values
```

**Output style:** Color-coded tables, spinners during async ops, green/yellow/red status indicators. No external API keys required for basic operation.

---

## 2. BACKEND LOGIC — COMPLETE SPECIFICATION

### 2.1 RPC Pool Routing Algorithm (detailed)

```
GIVEN: Pool of N endpoints with weights w[i], health status h[i]

STEP 1: Filter
  eligible = endpoints.filter(e => h[e] !== 'unhealthy')
  if eligible.empty:
    eligible = endpoints  // last resort: try all

STEP 2: Score
  For each endpoint e in eligible:
    score[e] = w[e] * health_multiplier[h[e]] / (latencyP50[e] + 1)
  where health_multiplier = { healthy: 1.0, degraded: 0.3, unhealthy: 0.05 }

STEP 3: Weighted random selection
  total = sum(score)
  r = random() * total
  cumulative = 0
  for e in eligible:
    cumulative += score[e]
    if r <= cumulative: return e

STEP 4: On failure of selected endpoint
  Remove from eligible for this request
  Increment failureCount[e]
  If failureCount[e] >= 3: mark h[e] = 'unhealthy'
  Go to STEP 2 with remaining eligible

STEP 5: On retry
  Apply RetryPolicy delay before STEP 2
  Log: helix.pool.failover event with from/to endpoints
```

### 2.2 WebSocket Subscription Management

The `RpcSubscriptionPool` manages WebSocket connections to each healthy RPC endpoint:

```typescript
class RpcSubscriptionPool {
  // Maintains 1 primary + 1 backup WebSocket connection
  // Primary: lowest latency endpoint
  // Backup: second-lowest latency endpoint
  // On primary disconnect: promote backup, connect new backup
  // Reconnect strategy: exponential backoff 100ms → 200ms → 400ms → ... → 30s
  // Ping/pong heartbeat every 30s to detect stale connections
  // On duplicate messages (same tx confirmed on both connections): deduplicate by signature
}
```

### 2.3 Metrics Server (Dashboard Backend)

```typescript
// apps/dashboard/lib/metricsServer.ts

// Fastify server with WebSocket plugin
// Routes:
//   GET /health          — server health
//   GET /metrics         — current snapshot (JSON)
//   WS /ws/metrics       — real-time stream (JSON, 1s interval)
//   GET /api/endpoints   — pool status
//   GET /api/tx-stream   — last 50 confirmed transactions

// WS message format:
interface MetricsFrame {
  timestamp: number;
  endpoints: EndpointMetricFrame[];
  transactions: TxMetricFrame;
  pool: PoolMetricFrame;
  jito: JitoMetricFrame;
}
```

---

## 3. DATABASE & STORAGE

### 3.1 In-Memory Storage (SDK, no persistent DB required)

The SDK itself is stateless between process restarts. All state is in-memory:

| Store | Type | TTL | Max Size |
|---|---|---|---|
| BlockhashCache | `Map<Commitment, CachedBlockhash>` | 80 slots (~50s) | 3 entries |
| EndpointHealth | `Map<string, EndpointHealth>` | Never (updated by health check) | N endpoints |
| MetricsBuffer | Ring buffer | 5 minutes of data | 300 samples |
| TipAccountCache | `string[]` (8 accounts) | 60s | Fixed |
| FeeEstimateCache | `Map<string, FeeEstimate>` | 5s | 100 entries |

### 3.2 Dashboard Persistence (Optional, PostgreSQL or SQLite)

For the monitoring dashboard to persist historical metrics beyond process restarts:

```sql
-- RPC endpoint health history
CREATE TABLE endpoint_health_history (
  id          SERIAL PRIMARY KEY,
  endpoint    TEXT NOT NULL,
  status      TEXT NOT NULL,               -- 'healthy' | 'degraded' | 'unhealthy'
  latency_p50 INTEGER,
  latency_p95 INTEGER,
  error_rate  REAL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON endpoint_health_history (endpoint, recorded_at DESC);

-- Transaction history
CREATE TABLE transaction_history (
  signature          TEXT PRIMARY KEY,
  status             TEXT NOT NULL,        -- 'sent' | 'confirmed' | 'dropped' | 'failed'
  confirmation_slot  INTEGER,
  confirmation_ms    INTEGER,
  retry_count        INTEGER DEFAULT 0,
  jito_used          BOOLEAN DEFAULT FALSE,
  fee_lamports       BIGINT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON transaction_history (created_at DESC);
CREATE INDEX ON transaction_history (status, created_at DESC);

-- Pool failover events
CREATE TABLE failover_events (
  id          SERIAL PRIMARY KEY,
  from_endpoint TEXT NOT NULL,
  to_endpoint   TEXT NOT NULL,
  reason        TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Dashboard storage default:** SQLite via `better-sqlite3` (no external database server required). PostgreSQL available via environment variable `DATABASE_URL`.

### 3.3 Data Retention Policy

- Endpoint health history: 7 days
- Transaction history: 24 hours
- Failover events: 7 days
- Cleanup: cron job every 6 hours, DELETE WHERE created_at < NOW() - INTERVAL

---

## 4. AUTH & PERMISSIONS

### 4.1 SDK Level (No Auth)

The core SDK packages (`@helix-sdk/core`, `@helix-sdk/jito`, `@helix-sdk/fees`) require zero authentication. They are stateless tools that use caller-provided RPC endpoints.

RPC endpoint authentication (if any) is handled by the caller embedding auth tokens in endpoint URLs:
```
https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
https://YOUR_PROJECT_ID.solana-mainnet.quiknode.pro/TOKEN/
```

### 4.2 Diagnostics CLI

No authentication for basic health checks. Jito tests use public endpoints. Devnet transactions use user-provided keypair file (never leaves local machine).

### 4.3 Dashboard Authentication (Optional)

For production dashboard deployments, implement:

```typescript
// apps/dashboard/middleware.ts
// NextAuth.js with provider options:
// - Email magic link (no password required)
// - GitHub OAuth (for dev team use)
// - API key for programmatic access (Bearer token)

// Role model:
// viewer — read metrics, no config
// admin  — configure endpoints, set alerts
// api    — programmatic access to /api/metrics
```

### 4.4 Metrics API Authentication

The `/metrics` endpoint (Prometheus scrape) should be protected:
- Bearer token via `Authorization: Bearer <token>`
- Token set via `HELIX_METRICS_TOKEN` environment variable
- If not set, localhost-only access

---

## 5. HOSTING & DEPLOYMENT

### 5.1 SDK Distribution

Packages published to npm registry under `@helix-sdk/` namespace:
- `@helix-sdk/core`
- `@helix-sdk/jito`
- `@helix-sdk/fees`
- `@helix-sdk/wallet-adapter`
- `@helix-sdk/observability`
- `@helix-sdk/diagnostics`

Published as ESM + CJS dual builds. Types included. Source maps included.

**Package.json exports field:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  }
}
```

### 5.2 Monitoring Dashboard Deployment

**Option A: Vercel (default, zero config)**
- Connect GitHub repo, set environment variables
- Auto-deploy on push to main
- Serverless functions for API routes
- Environment: `DATABASE_URL`, `HELIX_WS_PORT`, `HELIX_METRICS_TOKEN`

**Option B: Docker**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/apps/dashboard/.next ./.next
COPY --from=build /app/apps/dashboard/public ./public
EXPOSE 3000 9090 3001
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

**Option C: Railway / Render (1-click from README)**

### 5.3 Diagnostics CLI Installation

```bash
# Global install
npm install -g @helix-sdk/diagnostics
pnpm add -g @helix-sdk/diagnostics

# npx (no install)
npx helix-diag check https://api.mainnet-beta.solana.com

# Binary releases via GitHub Releases (using pkg)
# Targets: linux-x64, linux-arm64, macos-x64, macos-arm64, win32-x64
```

---

## 6. CLOUD & COMPUTE

### 6.1 SDK Compute Requirements

The SDK runs in the developer's own environment. No cloud compute required.

**SDK Resource Profile (per application using Helix):**
- Memory: ~5-15MB overhead (metrics buffer + connection pool)
- CPU: <1% overhead on typical dApp workload
- Network: 1 health check request per endpoint per 5 seconds (configurable)

### 6.2 Dashboard Compute Requirements

**Minimum (development):**
- 512MB RAM, 1 vCPU
- Handles: 10 concurrent connections, 5 monitored endpoints

**Production (small team):**
- 1GB RAM, 1 vCPU
- Handles: 100 concurrent connections, 50 monitored endpoints

**Production (protocol):**
- 4GB RAM, 4 vCPU
- Handles: 1000 concurrent connections, 500 monitored endpoints
- Add: Redis for metrics pub/sub between instances

### 6.3 Metrics Collector Recommendations

For production OTel export:
- **Self-hosted**: OpenTelemetry Collector → Prometheus → Grafana (all free)
- **SaaS**: Grafana Cloud free tier (10k metrics series, 50GB logs)
- **Datadog**: Requires paid plan (metrics are cheap, ~$0.002/metric/month)
- **Honeycomb**: Generous free tier for spans

---

## 7. CI/CD & VERSION CONTROL

### 7.1 Repository Structure

- **Main branch**: `main` — production-ready, protected
- **Dev branch**: `develop` — integration
- **Feature branches**: `feat/RPC-pool`, `feat/jito-integration`, etc.
- **Release branches**: `release/v0.1.0`, etc.
- **Hotfix branches**: `hotfix/critical-bug`

Branch protection rules for `main`:
- Require PR with 1 review (or own review for solo)
- Require all CI checks to pass
- No force push

### 7.2 GitHub Actions Workflows

#### ci.yml (runs on every PR and push)
```yaml
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck  # tsc --noEmit across all packages

  lint:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm lint  # eslint --max-warnings 0

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - run: pnpm test
      - uses: codecov/codecov-action@v4

  build:
    needs: [typecheck, lint, test]
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build  # turbo build all packages
```

#### release.yml (runs on version tag push)
```yaml
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build
      - run: pnpm changeset publish
    env:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### coverage.yml (runs on main push)
```yaml
jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test --coverage
      - run: pnpm coverage:badge  # update README badge
      - uses: peaceiris/actions-gh-pages@v4  # publish coverage report
```

### 7.3 Version Management

Using `@changesets/cli` for semver:
```bash
# When shipping a feature:
pnpm changeset       # describe change
pnpm version         # bump versions
pnpm release         # publish to npm
```

---

## 8. SECURITY & ROW-LEVEL SECURITY

### 8.1 SDK Security Model

**Keypair Safety:**
- The SDK never touches private keys directly
- `signTransactionMessageWithSigners` is always called by the caller with their own signer
- Diagnostics CLI: keypair loaded from file path, only used for devnet test tx, never logged

**RPC Endpoint URLs:**
- Never logged at INFO level (may contain API keys in URL)
- Redacted in error messages: `https://***@endpoint.com`
- Stored only in memory, never persisted

**Bundle Transactions:**
- Transaction bytes are signed before leaving the caller's environment
- SDK only routes signed bytes — never has access to signing material

### 8.2 Dashboard Security

**Environment Variables:**
```
HELIX_METRICS_TOKEN=<random 256-bit hex>
NEXTAUTH_SECRET=<random 256-bit hex>
DATABASE_URL=<connection string>
DD_API_KEY=<datadog key>
```

Never committed to git. Required via `.env.local` (gitignored) or hosting platform secrets.

**API Route Protection:**
```typescript
// Middleware on all /api/* routes:
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (token !== process.env.HELIX_METRICS_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
}
```

**Content Security Policy:**
```
default-src 'self';
connect-src 'self' wss: https://*.solana.com;
script-src 'self';
style-src 'self' 'unsafe-inline';
```

**CORS:**
- Dashboard API: only allow `HELIX_ALLOWED_ORIGINS` list
- Default: localhost only
- Production: set to specific domain

### 8.3 Dependency Security

```bash
# Run on every CI build:
pnpm audit --audit-level=high
# Block merge if critical/high vulnerabilities found

# Weekly automated PR:
# Dependabot configured for all workspace packages
```

---

## 9. RATE LIMITING

### 9.1 Outbound Rate Limiting (to RPC endpoints)

The SDK respects per-endpoint rate limits:

```typescript
interface RateLimiter {
  // Token bucket algorithm
  // capacity: rateLimitRps * burst_seconds (default burst: 2s)
  // refill: rateLimitRps tokens per second
  acquireToken(endpoint: string): Promise<void>;
  getRemainingTokens(endpoint: string): number;
}
```

**Default RPC limits (used when not configured):**
- `api.mainnet-beta.solana.com`: 10 req/s
- `api.devnet.solana.com`: 10 req/s
- Custom endpoints: unlimited (trust caller config)

**Rate Limit Recovery:**
- On HTTP 429: back off for `Retry-After` header value, or 5s if absent
- Mark endpoint `degraded` for 30s
- Route to next healthy endpoint immediately
- Emit: `helix.rpc.rate_limited` counter

### 9.2 Dashboard Inbound Rate Limiting

```typescript
// Fastify rate-limit plugin configuration:
{
  max: 100,           // 100 requests per window
  timeWindow: 60000,  // per minute
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Try again in 60 seconds.'
  })
}

// WebSocket: max 10 concurrent connections per IP
// Metrics endpoint: stricter — 60 req/min (Prometheus scrape interval is 15s)
```

---

## 10. CACHING & CDN

### 10.1 SDK-Level Caches

| Cache | Strategy | TTL | Eviction |
|---|---|---|---|
| Blockhash | Pre-fetch + TTL | 80 slots | LRU, 3 entries |
| Fee estimates | TTL | 5 seconds | TTL |
| Tip accounts | TTL | 60 seconds | TTL |
| Endpoint health | No cache (live) | — | — |
| Signature status | No cache (live) | — | — |

### 10.2 Dashboard Caching

**API response caching:**
- `/api/endpoints`: `Cache-Control: public, max-age=5` (5s)
- `/api/tx-stream`: No cache (real-time)
- `/metrics`: No cache (Prometheus needs fresh data)

**Static assets (Next.js):**
- JS/CSS chunks: `Cache-Control: public, max-age=31536000, immutable`
- Served via Vercel Edge CDN or Cloudflare

**Dashboard-side caching (React Query):**
```typescript
// staleTime: 5000  — don't refetch for 5s if data exists
// gcTime: 30000    — keep unused data in memory for 30s
// refetchInterval: 5000  — auto-refresh every 5s
```

---

## 11. LOAD BALANCING & SCALING

### 11.1 SDK Load Balancing (RPC Pool)

The RpcPool is itself the load balancer. It distributes requests across endpoints using weighted routing (see Section 2.1).

**Horizontal Scaling Pattern:**
Multiple app instances each run their own RpcPool. No shared state required. Health check state is per-instance.

**For global consistency:** Optional Redis adapter stores pool health state:
```typescript
// Optional: share pool health across instances
const pool = createRpcPool({
  endpoints: [...],
  stateAdapter: new RedisPoolStateAdapter({ url: process.env.REDIS_URL }),
});
```

### 11.2 Dashboard Scaling

**Single instance:** Suitable for ≤100 concurrent users.

**Multi-instance with Redis pub/sub:**
```
Instance 1 → reads RPC metrics → publishes to Redis channel
Instance 2 → reads RPC metrics → publishes to Redis channel
All instances → subscribe to Redis → broadcast to connected WebSocket clients
```

**WebSocket sticky sessions:** Required for multi-instance. Use Nginx ip_hash or Railway private networking.

---

## 12. ERROR TRACKING & LOGS

### 12.1 Error Hierarchy

```typescript
class HelixError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown,
  ) { super(message); }
}

class HelixRpcError extends HelixError { /* endpoint, method, attempt */ }
class HelixPoolExhaustedError extends HelixError { /* all endpoints tried */ }
class HelixTransactionDroppedError extends HelixError { /* signature, slot, reason */ }
class HelixTransactionTimeoutError extends HelixError { /* signature, elapsed, blockhash */ }
class HelixBlockhashExpiredError extends HelixError { /* lastValidBlockHeight, currentSlot */ }
class HelixJitoBundleRejectedError extends HelixError { /* bundleId, reason */ }
class HelixFeeEstimationError extends HelixError { /* source, cause */ }
class HelixConfigError extends HelixError { /* field, value, reason */ }
```

### 12.2 Logging Strategy

**SDK:** Uses a pluggable logger interface. Default: pino (structured JSON).

```typescript
interface HelixLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}
// Caller injects their own logger:
const client = createHelixClient({ logger: pinoLogger, ... });
```

**Log levels:**
- `debug`: every RPC call start/end, retry attempts, health check pings
- `info`: pool changes, endpoint status changes, successful confirmations
- `warn`: degraded endpoints, retry needed, fee estimate fallback used
- `error`: pool exhausted, transaction dropped, unhandled rejection

**Sensitive field redaction:**
```typescript
// Redact from all log output:
const REDACTED_FIELDS = ['apiKey', 'token', 'privateKey', 'secret', 'authorization'];
// Endpoint URLs: redact query param values
// "https://helius-rpc.com/?api-key=abc123" → "https://helius-rpc.com/?api-key=***"
```

### 12.3 Error Reporting

For dashboard, integrate Sentry (optional, free tier):
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of transactions
});
```

---

## 13. AVAILABILITY & RECOVERY

### 13.1 SDK Availability Design

The SDK is designed for **zero single points of failure**:

| Component | Failure Mode | Recovery |
|---|---|---|
| Primary RPC endpoint | 429, 503, timeout | Failover to next healthy endpoint in <100ms |
| All RPC endpoints | Catastrophic | Retry with backoff, emit alert, surface error to caller |
| WebSocket connection | Disconnect | Reconnect with backoff, fall back to polling |
| Blockhash cache | Stale | Bypass cache, fetch fresh, rebuild transaction |
| Jito block engine | Unavailable | Bypass Jito, send directly to RPC |
| Fee oracle | API down | Cascade to next provider, use static floor |

### 13.2 Recovery Procedures

**Scenario: All RPC nodes degraded during Solana validator restart**
```
1. All health checks fail simultaneously
2. SDK marks all endpoints 'unhealthy'
3. FallbackChain enters "all-unhealthy" mode:
   - Try each endpoint with 2s timeout once
   - If any responds: immediately restore to pool
4. Emit: helix.pool.all_unhealthy_recovery alert
5. Alert integrations (webhook, PagerDuty) if configured
6. Backoff: retry all endpoints every 10s until recovery
```

**Scenario: Transaction dropped during network congestion**
```
1. TransactionSender sends tx
2. Blockhash expiry detected at slot 150
3. HelixBlockhashExpiredError thrown internally
4. TransactionSender fetches new blockhash
5. Caller re-signs transaction (using caller's signing callback)
6. Transaction resubmitted with fresh blockhash
7. Emit: helix.tx.blockhash_refresh counter
```

**Scenario: Jito bundle dropped (common during periods of low tips)**
```
1. JitoClient.sendBundle() → bundle UUID
2. Poll getBundleStatuses() — status: 'Failed'
3. JitoFallbackSender triggers
4. Route same transactions directly to RpcPool
5. Standard confirmation flow resumes
6. Emit: helix.jito.bundle_dropped, helix.jito.fallback_activated
```

### 13.3 Health Check Endpoints

```
GET /health           — 200 if server up, 503 if degraded
GET /health/ready     — 200 if all services initialized
GET /health/live      — 200 always (K8s liveness)
GET /health/startup   — 200 once startup complete (K8s startup probe)
```

### 13.4 Backup and Disaster Recovery (Dashboard)

For SQLite: daily backup to S3/R2 via cron.
For PostgreSQL: enable continuous WAL archiving. Point-in-time recovery.
RPO: 24 hours (daily backup). RTO: 30 minutes (restore from backup).

---

## 14. SUBMISSION REQUIREMENTS VERIFICATION

```
✓ Public GitHub repo with all source code
  → Repository: github.com/<username>/helix-sdk (public)

✓ Web3.js v2.0 compatibility verified with tests
  → Test suite: packages/core/tests/*.test.ts imports @solana/web3.js v2.0 exclusively
  → CI: tsc --noEmit verifies no v1 imports

✓ Wallet adapter integration with at least one major wallet
  → Phantom: packages/wallet-adapter/tests/wallet-adapter.test.ts

✓ Jito/MEV routing implemented and documented
  → Implementation: packages/jito/src/JitoClient.ts
  → Documentation: packages/jito/README.md + docs/architecture.md

✓ Observability exports working (OpenTelemetry or Datadog)
  → OTel: packages/observability/tests/exporters.test.ts asserts metric export
  → Datadog: packages/observability/tests/exporters.test.ts asserts DD format

✓ Diagnostics CLI functional
  → Binary: helix-diag (npm bin)
  → All 5 commands tested in packages/diagnostics/tests/cli.test.ts

✓ 90%+ test coverage with network simulation tests
  → Coverage report: ./coverage/index.html
  → Simulation tests: packages/core/tests/simulation/*.test.ts
```

---

*Helix SDK PRD — Every requirement covered. Every edge case handled.*
