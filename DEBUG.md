# DEBUG.md — Debugging, Testing & Troubleshooting Guide
## Helix SDK: Zero-Bug Standard. 90%+ Coverage. Every Edge Case Tested.

---

## 0. AGENT DEBUG PRIME DIRECTIVE

**When something fails: STOP. READ THIS FILE. FIX THE ROOT CAUSE. RERUN THE FULL TEST SUITE. ONLY THEN MARK IT DONE.**

No bug is "acceptable for now." No flaky test is "intermittent and probably fine." No coverage gap is "not important for that path." Every failure is a signal. Every gap is a risk. Judges will run the tests. Judges will simulate failures. If it breaks in front of them, you don't win.

**The debug loop:**
```
1. Run test suite → identify failing test
2. Read error output completely — all of it, not just the first line
3. Read the source file that owns the failing function
4. Form a hypothesis about root cause
5. Add a focused test that isolates the failure
6. Fix the source code
7. Run: pnpm test --run <failing-test-file>  ← verify fix
8. Run: pnpm test ← full suite, catch regressions
9. Run: pnpm test --coverage ← verify coverage didn't drop
10. If coverage dropped: add tests before closing the loop
```

---

## 1. TEST ARCHITECTURE

### 1.1 Test Stack

| Tool | Purpose |
|------|---------|
| **Vitest 2.x** | Test runner, assertions, mocking |
| **@vitest/coverage-v8** | Code coverage via V8 (native, no Babel needed) |
| **msw 2.x** | HTTP/WebSocket request interception (network simulation) |
| **@solana/web3.js (devnet)** | Integration tests against real devnet |
| **ink-testing-library** | CLI output assertions |
| **Playwright** | E2E tests for monitoring dashboard |

### 1.2 Vitest Configuration

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/tests/**',
        '**/*.config.ts',
        '**/examples/**',
        '**/docs/**',
      ],
    },
    // Increase timeout for network simulation tests
    timeout: 30_000,
    // Group slow tests separately
    sequence: {
      concurrent: true,
    },
    pool: 'forks',   // Required for AbortController-heavy tests
    poolOptions: {
      forks: { singleFork: false }
    }
  },
});
```

### 1.3 Test Setup File

```typescript
// test-setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test (prevent bleed-through)
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());

// Suppress pino logging in tests
process.env.LOG_LEVEL = 'silent';
```

### 1.4 MSW Server Setup

```typescript
// test/mocks/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

export const MOCK_ENDPOINTS = {
  primary: 'https://mock-primary.rpc',
  secondary: 'https://mock-secondary.rpc',
  tertiary: 'https://mock-tertiary.rpc',
  jito: 'https://mainnet.block-engine.jito.wtf',
  helius: 'https://mainnet.helius-rpc.com',
};

export const defaultHandlers = [
  // Default healthy RPC response
  http.post(MOCK_ENDPOINTS.primary, () =>
    HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' /* slot */ })
  ),
  http.post(MOCK_ENDPOINTS.secondary, () =>
    HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' })
  ),
];

export const server = setupServer(...defaultHandlers);
```

---

## 2. COMPLETE TEST MATRIX

### 2.1 @helix-sdk/core — RpcPool

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| POOL-001 | All endpoints healthy → requests distributed | Weighted distribution, all endpoints receive traffic | pool.test.ts |
| POOL-002 | Primary endpoint returns 429 → failover | Request routed to secondary within 100ms | pool.test.ts |
| POOL-003 | Primary endpoint 503 → mark degraded → failover | Endpoint status updated to 'degraded' | pool.test.ts |
| POOL-004 | Primary endpoint 3 consecutive failures → mark unhealthy | Status 'unhealthy', excluded from routing | pool.test.ts |
| POOL-005 | All endpoints 503 → all-unhealthy mode | Retry all endpoints, emit alert, throw HelixPoolExhaustedError | pool.test.ts |
| POOL-006 | Endpoint recovers after being unhealthy | Re-added to healthy pool on next successful health check | pool.test.ts |
| POOL-007 | Health check fires every healthCheckIntervalMs | Timer fires at correct interval, sends getSlot() | pool.test.ts |
| POOL-008 | Endpoint timeout (AbortController) | Timeout throws, endpoint marked degraded | pool.test.ts |
| POOL-009 | Weight configuration respected | High-weight endpoint receives proportionally more traffic | pool.test.ts |
| POOL-010 | Priority configuration respected | Priority 1 endpoint always tried before priority 2 | pool.test.ts |
| POOL-011 | Rate limit token bucket fills correctly | After 429, waits correct duration before retry | pool.test.ts |
| POOL-012 | Concurrent requests from same endpoint | Max concurrent requests respected, excess queued | pool.test.ts |
| POOL-013 | destroy() closes all connections | No open handles after destroy | pool.test.ts |
| POOL-014 | Empty endpoint list throws HelixConfigError | Error thrown at construction time | pool.test.ts |
| POOL-015 | Invalid URL in endpoint list throws HelixConfigError | Error on invalid URL format | pool.test.ts |

### 2.2 @helix-sdk/core — FallbackChain

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| FALL-001 | Exponential backoff delay increases correctly | delay[n+1] = delay[n] * multiplier | client.test.ts |
| FALL-002 | Jitter applied within factor bounds | |delay - base| <= base * jitterFactor | client.test.ts |
| FALL-003 | maxAttempts respected | Never exceeds maxAttempts retries | client.test.ts |
| FALL-004 | maxDelay cap respected | Delay never exceeds maxDelayMs | client.test.ts |
| FALL-005 | Non-retryable error (HTTP 400) propagated immediately | No retry, error thrown immediately | client.test.ts |
| FALL-006 | Non-retryable error (InstructionError) not retried | Error surfaces immediately to caller | client.test.ts |
| FALL-007 | AbortSignal cancels in-flight retry | When signal aborted, retry stops, returns ABORT_ERR | client.test.ts |
| FALL-008 | AbortSignal aborted before first attempt | Error thrown immediately, no attempt made | client.test.ts |
| FALL-009 | onEndpointFail callback fires on each failure | Callback called with (endpoint, error) | client.test.ts |
| FALL-010 | onFallback callback fires on endpoint switch | Callback called with (from, to) | client.test.ts |
| FALL-011 | onExhausted callback fires after maxAttempts | Callback called with (attempts, lastError) | client.test.ts |

### 2.3 @helix-sdk/core — TransactionSender

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| TX-001 | Happy path: send → confirm | Returns signature, emits metric | transaction.test.ts |
| TX-002 | Send succeeds, confirmation polling confirms | Confirmed via polling, returns sig | transaction.test.ts |
| TX-003 | Send succeeds, WebSocket confirms | Confirmed via WS, polling cancelled | transaction.test.ts |
| TX-004 | Blockhash expires mid-wait | HelixBlockhashExpiredError thrown | transaction.test.ts |
| TX-005 | Transaction resent every resendIntervalMs | sendTransaction called N times during wait | transaction.test.ts |
| TX-006 | Confirmation timeout exceeded | HelixTransactionTimeoutError thrown with signature | transaction.test.ts |
| TX-007 | Transaction dropped (error in status) | HelixTransactionDroppedError with reason | transaction.test.ts |
| TX-008 | AbortSignal cancels waiting confirmation | ABORT_ERR thrown, polling stopped | transaction.test.ts |
| TX-009 | onConfirmation callback fired correctly | Callback receives (signature, slot) | transaction.test.ts |
| TX-010 | onRetry callback fired on each retry | Callback receives (attempt, reason) | transaction.test.ts |

### 2.4 @helix-sdk/core — BlockhashCache

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| HASH-001 | First call fetches from RPC | RPC getLatestBlockhash called | transaction.test.ts |
| HASH-002 | Second call within TTL uses cache | RPC not called again (cache hit) | transaction.test.ts |
| HASH-003 | Cache expires → refresh from RPC | RPC called again after TTL | transaction.test.ts |
| HASH-004 | Prefetch triggered at threshold | Background refresh called early | transaction.test.ts |
| HASH-005 | Blockhash with <20 slots remaining rejected | Fetch new blockhash, not cached one | transaction.test.ts |
| HASH-006 | Concurrent cache misses — only one RPC call | Pending promise shared (no thundering herd) | transaction.test.ts |

### 2.5 @helix-sdk/jito — JitoClient

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| JITO-001 | getTipAccounts() returns 8 accounts | Array of 8 valid addresses | jito-client.test.ts |
| JITO-002 | Tip account rotates randomly | Different accounts selected across calls | jito-client.test.ts |
| JITO-003 | Bundle constructed correctly | Tip instruction appended to last tx | jito-client.test.ts |
| JITO-004 | sendBundle() returns bundle UUID | UUID string returned | jito-client.test.ts |
| JITO-005 | Bundle status poll — accepted | BundleResult.status === 'accepted' | jito-client.test.ts |
| JITO-006 | Bundle status poll — rejected | BundleResult.status === 'rejected' with reason | jito-client.test.ts |
| JITO-007 | Bundle timeout → fallback to RPC | RPC sendTransaction called after timeout | bundle-fallback.test.ts |
| JITO-008 | Jito endpoint 503 → try alternate region | Next regional endpoint tried | jito-client.test.ts |
| JITO-009 | All Jito regions fail → fallback | RPC fallback activated | bundle-fallback.test.ts |
| JITO-010 | Tip amount clamped to [min, max] | Tip never below minTip, never above maxTip | jito-client.test.ts |
| JITO-011 | Dynamic tip mode fetches from oracle | TipOracle.getRecommendedTip() called | tip-oracle.test.ts |
| JITO-012 | Fixed tip mode ignores oracle | TipOracle never called in fixed mode | tip-oracle.test.ts |

### 2.6 @helix-sdk/fees — FeeOracle

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| FEE-001 | Helius provider returns estimate | Uses Helius value, source='helius' | fee-oracle.test.ts |
| FEE-002 | Helius API down → native provider | Falls back to native, source='native' | fee-oracle.test.ts |
| FEE-003 | Both providers fail → static floor | Returns minMicrolamportsPerCu | fee-oracle.test.ts |
| FEE-004 | Fee capped at maxMicrolamportsPerCu | Never exceeds cap even if providers say higher | fee-oracle.test.ts |
| FEE-005 | Fee cache hit (within TTL) | No API calls, returns cached value | fee-oracle.test.ts |
| FEE-006 | Fee cache miss (past TTL) | Fresh API call made | fee-oracle.test.ts |
| FEE-007 | Simulation returns compute units | CU from simulation used for SetComputeUnitLimit | simulation.test.ts |
| FEE-008 | Simulation failure → fallback CU | Default 200_000 used if simulation fails | simulation.test.ts |
| FEE-009 | 10% CU buffer applied | budgetedUnits = ceil(simulated * 1.1) | simulation.test.ts |
| FEE-010 | CU clamped to [1000, 1_400_000] | Never below 1000 or above 1.4M | simulation.test.ts |
| FEE-011 | SetComputeUnitLimit instruction built correctly | Instruction matches expected serialization | simulation.test.ts |
| FEE-012 | SetComputeUnitPrice instruction built correctly | Instruction encodes microlamports correctly | simulation.test.ts |

### 2.7 @helix-sdk/observability — Metrics

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| OBS-001 | RPC call emits helix.rpc.latency_ms | Histogram record called with latency value | metrics.test.ts |
| OBS-002 | Failed RPC call increments helix.rpc.errors_total | Counter incremented with error_code label | metrics.test.ts |
| OBS-003 | Successful RPC increments helix.rpc.requests_total | Counter incremented with status='success' | metrics.test.ts |
| OBS-004 | Pool failover emits helix.pool.failover_total | Counter incremented with from/to labels | metrics.test.ts |
| OBS-005 | helix.pool.healthy_nodes gauge accurate | Gauge reflects current healthy count | metrics.test.ts |
| OBS-006 | Tx confirmation emits helix.tx.confirmation_time_ms | Histogram records elapsed ms | metrics.test.ts |
| OBS-007 | Tx drop increments helix.tx.dropped_total | Counter incremented with reason label | metrics.test.ts |
| OBS-008 | OTel span created for each RPC call | Span started + ended with correct attributes | tracing.test.ts |
| OBS-009 | OTel span attributes populated | rpc.method, rpc.endpoint, outcome set | tracing.test.ts |
| OBS-010 | OTel span error status on failure | Span status set to ERROR on RPC failure | tracing.test.ts |
| OBS-011 | OTel exporter receives metric batches | Mock exporter records export calls | exporters.test.ts |
| OBS-012 | Datadog exporter formats metrics correctly | Metric payload matches DD API format | exporters.test.ts |
| OBS-013 | Prometheus endpoint returns text format | /metrics returns valid Prometheus text | exporters.test.ts |
| OBS-014 | MetricEmitter cleanup on destroy | No memory leaks, intervals cleared | metrics.test.ts |

### 2.8 @helix-sdk/wallet-adapter

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| WALLET-001 | wrap() returns enhanced adapter | Has all original methods + Helix methods | wallet-adapter.test.ts |
| WALLET-002 | sendTransaction intercepted by middleware | ResilienceMiddleware intercepts call | wallet-adapter.test.ts |
| WALLET-003 | Compute budget injected into wrapped tx | CU limit + price instructions prepended | wallet-adapter.test.ts |
| WALLET-004 | Wallet signature rejection propagated | WalletSignTransactionError not caught/swallowed | wallet-adapter.test.ts |
| WALLET-005 | RPC failure retried via HelixRpcClient | Retry happens transparently to caller | wallet-adapter.test.ts |
| WALLET-006 | Original adapter accessible via .original | enhanced.original === phantomAdapter | wallet-adapter.test.ts |
| WALLET-007 | Wallet disconnect cleans up Helix resources | destroy() called on wallet disconnect | wallet-adapter.test.ts |

### 2.9 @helix-sdk/diagnostics — CLI

| Test ID | Scenario | Expected | File |
|---------|----------|----------|------|
| CLI-001 | helix-diag check <url> — healthy endpoint | Table shows GREEN, all metrics populated | cli.test.ts |
| CLI-002 | helix-diag check <url> — 429 endpoint | Table shows DEGRADED, error rate reported | cli.test.ts |
| CLI-003 | helix-diag check <url> — unreachable endpoint | Table shows UNHEALTHY, all metrics N/A | cli.test.ts |
| CLI-004 | helix-diag pool <url1> <url2> <url3> | Pool status table shows all 3 endpoints | cli.test.ts |
| CLI-005 | helix-diag pool --simulate-failures | Random failures simulated, failover shown | cli.test.ts |
| CLI-006 | helix-diag tx --rpc <url> --keypair <path> | Test tx sent, sig + confirmation shown | cli.test.ts |
| CLI-007 | helix-diag jito | Tip accounts listed, recommendation shown | cli.test.ts |
| CLI-008 | helix-diag metrics --format json | Valid JSON output to stdout | cli.test.ts |
| CLI-009 | helix-diag metrics --format table | Formatted table to stdout | cli.test.ts |
| CLI-010 | helix-diag metrics --format prometheus | Valid Prometheus text format to stdout | cli.test.ts |
| CLI-011 | Missing required argument exits code 1 | Process exits with 1, error to stderr | cli.test.ts |
| CLI-012 | --help flag prints usage | Usage text to stdout, exits 0 | cli.test.ts |

---

## 3. NETWORK SIMULATION TESTS

These are the hardest tests to write and the most valuable to judges. Every simulation test must:
1. Set up an MSW handler that simulates the failure condition
2. Create a HelixRpcClient with the mock endpoints
3. Trigger the failure
4. Assert the recovery behavior
5. Assert the correct metrics were emitted

### 3.1 Network Drop Simulation

```typescript
// packages/core/tests/simulation/network-drop.test.ts

import { describe, it, expect, vi } from 'vitest';
import { server, MOCK_ENDPOINTS } from '../../test/mocks/server';
import { http, HttpResponse, delay } from 'msw';
import { createHelixClient } from '../src';

describe('Network Drop Simulation', () => {
  
  it('NETDROP-001: primary drops mid-stream → failover within 100ms', async () => {
    let primaryCallCount = 0;
    
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async () => {
        primaryCallCount++;
        if (primaryCallCount >= 2) {
          // Simulate connection drop after first successful call
          return HttpResponse.error();
        }
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '287483920' });
      }),
      http.post(MOCK_ENDPOINTS.secondary, () =>
        HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '287483921' })
      ),
    );
    
    const failoverEvents: string[] = [];
    const client = createHelixClient({
      endpoints: [
        { url: MOCK_ENDPOINTS.primary, priority: 1 },
        { url: MOCK_ENDPOINTS.secondary, priority: 2 },
      ],
      onFallback: (from, to) => failoverEvents.push(`${from} → ${to}`),
    });
    
    const start = Date.now();
    
    // First call succeeds on primary
    await client.getSlot();
    
    // Second call should fail on primary, succeed on secondary
    const slot = await client.getSlot();
    const elapsed = Date.now() - start;
    
    expect(slot).toBeTruthy();
    expect(failoverEvents).toHaveLength(1);
    expect(failoverEvents[0]).toContain(MOCK_ENDPOINTS.secondary);
    // Failover should be fast (not waiting for full timeout)
    expect(elapsed).toBeLessThan(500);
    
    await client.destroy();
  });

  it('NETDROP-002: all endpoints drop simultaneously → HelixPoolExhaustedError', async () => {
    server.use(
      http.post(MOCK_ENDPOINTS.primary, () => HttpResponse.error()),
      http.post(MOCK_ENDPOINTS.secondary, () => HttpResponse.error()),
    );
    
    const client = createHelixClient({
      endpoints: [
        { url: MOCK_ENDPOINTS.primary },
        { url: MOCK_ENDPOINTS.secondary },
      ],
      retryPolicy: { maxAttempts: 2, initialDelayMs: 10 },
    });
    
    await expect(client.getSlot()).rejects.toThrow('HelixPoolExhaustedError');
    
    await client.destroy();
  });

  it('NETDROP-003: endpoint drops then recovers → re-added to pool', async () => {
    let failCount = 0;
    
    server.use(
      http.post(MOCK_ENDPOINTS.primary, () => {
        failCount++;
        if (failCount <= 3) return HttpResponse.error();
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const statusChanges: string[] = [];
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
      healthCheckIntervalMs: 50, // Fast for testing
      onHealthChange: (endpoint, status) => statusChanges.push(status),
    });
    
    // Wait for health check to mark as unhealthy
    await new Promise(r => setTimeout(r, 200));
    expect(statusChanges).toContain('unhealthy');
    
    // Wait for health check to detect recovery
    await new Promise(r => setTimeout(r, 300));
    expect(statusChanges).toContain('healthy');
    
    await client.destroy();
  });

  it('NETDROP-004: WebSocket disconnect → polling fallback activated', async () => {
    // TODO: MSW WebSocket simulation when msw 2.x adds stable WS support
    // For now: mock the subscription factory to throw, assert polling kicks in
    
    const mockWsFactory = vi.fn().mockRejectedValue(new Error('WS_CONNECT_FAILED'));
    
    // ... (full implementation in actual test file)
  });
  
  it('NETDROP-005: Partial network partition (intermittent 50% drop rate)', async () => {
    let requestCount = 0;
    server.use(
      http.post(MOCK_ENDPOINTS.primary, () => {
        requestCount++;
        // Simulate 50% drop rate
        if (requestCount % 2 === 0) return HttpResponse.error();
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
      retryPolicy: { maxAttempts: 3, initialDelayMs: 10 },
    });
    
    // Should succeed despite 50% drop rate (retry catches the drops)
    const results = await Promise.all(
      Array.from({ length: 10 }, () => client.getSlot())
    );
    expect(results).toHaveLength(10);
    results.forEach(r => expect(r).toBeTruthy());
    
    await client.destroy();
  });
});
```

### 3.2 Rate Limit Simulation

```typescript
// packages/core/tests/simulation/rate-limit.test.ts

describe('Rate Limit Simulation', () => {
  
  it('RATELIMIT-001: 429 response → backoff → retry on same endpoint', async () => {
    let callCount = 0;
    server.use(
      http.post(MOCK_ENDPOINTS.primary, () => {
        callCount++;
        if (callCount === 1) {
          return new HttpResponse(null, {
            status: 429,
            headers: { 'Retry-After': '1' },
          });
        }
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const client = createHelixClient({ endpoints: [{ url: MOCK_ENDPOINTS.primary }] });
    const result = await client.getSlot();
    
    expect(result).toBeTruthy();
    expect(callCount).toBe(2);
  });

  it('RATELIMIT-002: sustained 429 → endpoint marked degraded → failover', async () => {
    server.use(
      http.post(MOCK_ENDPOINTS.primary, () => new HttpResponse(null, { status: 429 })),
      http.post(MOCK_ENDPOINTS.secondary, () =>
        HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' })
      ),
    );
    
    const statusChanges: Array<{ endpoint: string; status: string }> = [];
    const client = createHelixClient({
      endpoints: [
        { url: MOCK_ENDPOINTS.primary, priority: 1 },
        { url: MOCK_ENDPOINTS.secondary, priority: 2 },
      ],
      onHealthChange: (endpoint, status) => statusChanges.push({ endpoint, status }),
    });
    
    const result = await client.getSlot();
    expect(result).toBeTruthy();
    
    const primaryStatus = statusChanges.find(c => c.endpoint.includes('primary'));
    expect(primaryStatus?.status).toBe('degraded');
  });

  it('RATELIMIT-003: token bucket fills correctly after rate limit window', async () => {
    // Detailed token bucket behavior test
    const rateLimiter = createRateLimiter({ requestsPerSecond: 2 });
    
    // Consume all tokens
    await rateLimiter.acquire();
    await rateLimiter.acquire();
    
    // Third should wait
    const start = Date.now();
    await rateLimiter.acquire();
    const elapsed = Date.now() - start;
    
    // Should have waited ~500ms for token to refill
    expect(elapsed).toBeGreaterThan(400);
    expect(elapsed).toBeLessThan(700);
  });
  
  it('RATELIMIT-004: burst above rps limit triggers backpressure', async () => {
    // Send 20 concurrent requests to an endpoint limited to 5/s
    // Assert: none fail, all succeed (backpressure queues them)
    // Assert: elapsed time > 3s (20 requests / 5 rps = 4s minimum)
  });
});
```

### 3.3 Latency Spike Simulation

```typescript
// packages/core/tests/simulation/latency-spike.test.ts

describe('Latency Spike Simulation', () => {
  
  it('LATENCY-001: endpoint exceeds degraded threshold → status changes', async () => {
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async () => {
        await delay(2000); // Spike to 2000ms
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
      degradedLatencyThresholdMs: 1500,
      healthCheckIntervalMs: 100,
    });
    
    // Trigger a health check
    await new Promise(r => setTimeout(r, 300));
    
    const health = client.getHealthStatus();
    const primaryHealth = health.endpoints.find(e => e.url === MOCK_ENDPOINTS.primary);
    expect(primaryHealth?.status).toBe('degraded');
    
    await client.destroy();
  });

  it('LATENCY-002: timeout cancellation via AbortController', async () => {
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async () => {
        await delay(5000); // Much longer than timeout
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
      requestTimeoutMs: 500, // 500ms timeout
    });
    
    const start = Date.now();
    await expect(client.getSlot()).rejects.toThrow();
    const elapsed = Date.now() - start;
    
    // Should have aborted around 500ms, not waited 5000ms
    expect(elapsed).toBeLessThan(1000);
    
    await client.destroy();
  });

  it('LATENCY-003: P99 latency tracked correctly', async () => {
    let callCount = 0;
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async () => {
        callCount++;
        // 99% fast, 1% slow
        const latency = callCount % 100 === 0 ? 2000 : 50;
        await delay(latency);
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    const client = createHelixClient({ endpoints: [{ url: MOCK_ENDPOINTS.primary }] });
    
    // Make 100 calls
    for (let i = 0; i < 100; i++) {
      await client.getSlot();
    }
    
    const health = client.getHealthStatus();
    const metrics = health.endpoints[0];
    
    expect(metrics.latencyP50Ms).toBeLessThan(100);
    expect(metrics.latencyP99Ms).toBeGreaterThan(1000);
    
    await client.destroy();
  });
  
  it('LATENCY-004: slow endpoint deprioritized in weighted routing', async () => {
    const hitCounts = { primary: 0, secondary: 0 };
    
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async () => {
        hitCounts.primary++;
        await delay(1800); // Degraded but not unhealthy
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
      http.post(MOCK_ENDPOINTS.secondary, async () => {
        hitCounts.secondary++;
        await delay(50); // Fast
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '9' });
      }),
    );
    
    // After health checks detect slow primary, secondary should dominate
    const client = createHelixClient({
      endpoints: [
        { url: MOCK_ENDPOINTS.primary },
        { url: MOCK_ENDPOINTS.secondary },
      ],
      healthCheckIntervalMs: 100,
      degradedLatencyThresholdMs: 1500,
    });
    
    // Let health checks accumulate data
    await new Promise(r => setTimeout(r, 500));
    
    // Make 20 requests
    for (let i = 0; i < 20; i++) {
      await client.getSlot().catch(() => {});
    }
    
    // Secondary (fast) should receive most traffic
    expect(hitCounts.secondary).toBeGreaterThan(hitCounts.primary);
    
    await client.destroy();
  });
});
```

### 3.4 Transaction Lifecycle Simulation

```typescript
// packages/core/tests/simulation/tx-lifecycle.test.ts

describe('Transaction Lifecycle Simulation', () => {
  
  it('TX-SIM-001: Blockhash expiry → auto-rebuild and resend', async () => {
    let blockhashFetchCount = 0;
    
    server.use(
      http.post(MOCK_ENDPOINTS.primary, async ({ request }) => {
        const body = await request.json() as { method: string };
        
        if (body.method === 'getLatestBlockhash') {
          blockhashFetchCount++;
          return HttpResponse.json({
            jsonrpc: '2.0', id: 1,
            result: {
              value: {
                blockhash: `hash${blockhashFetchCount}`,
                lastValidBlockHeight: 100 + blockhashFetchCount,
              }
            }
          });
        }
        
        if (body.method === 'sendTransaction') {
          // First send: simulate blockhash not found
          if (blockhashFetchCount < 2) {
            return HttpResponse.json({
              jsonrpc: '2.0', id: 1,
              error: { code: -32002, message: 'Transaction simulation failed: Blockhash not found' }
            });
          }
          return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '5xHG...sig' });
        }
        
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: null });
      }),
    );
    
    const onBlockhashExpiry = vi.fn();
    
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
    });
    
    // This should auto-refresh blockhash and succeed
    const sig = await client.sendAndConfirmTransaction(mockSignedTx, {
      onBlockhashExpiry,
    });
    
    expect(sig).toBeTruthy();
    expect(blockhashFetchCount).toBeGreaterThanOrEqual(2);
  });

  it('TX-SIM-002: Jito bundle dropped → RPC fallback confirms', async () => {
    let jitoAttempted = false;
    let rpcAttempted = false;
    
    server.use(
      http.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', () => {
        jitoAttempted = true;
        return HttpResponse.json({
          jsonrpc: '2.0', id: 1,
          error: { code: -32000, message: 'Bundle dropped: insufficient tip' }
        });
      }),
      http.post(MOCK_ENDPOINTS.primary, async ({ request }) => {
        const body = await request.json() as { method: string };
        if (body.method === 'sendTransaction') {
          rpcAttempted = true;
          return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: '5xHG...sig' });
        }
        return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: null });
      }),
    );
    
    const client = createHelixClient({
      endpoints: [{ url: MOCK_ENDPOINTS.primary }],
      jito: { enabled: true, rpcFallback: true },
    });
    
    const sig = await client.sendAndConfirmTransaction(mockSignedTx);
    
    expect(jitoAttempted).toBe(true);
    expect(rpcAttempted).toBe(true);
    expect(sig).toBeTruthy();
  });
});
```

---

## 4. COMPLETE ERROR CATALOG

### 4.1 HelixError Code Reference

| Error Code | Class | When Thrown | Contains |
|---|---|---|---|
| `HELIX_CONFIG_INVALID` | HelixConfigError | Bad constructor args | field, value, reason |
| `HELIX_POOL_EXHAUSTED` | HelixPoolExhaustedError | All endpoints failed | attempts, lastError, endpoints[] |
| `HELIX_RPC_TIMEOUT` | HelixRpcError | Request exceeded timeout | endpoint, method, timeoutMs |
| `HELIX_RPC_RATE_LIMITED` | HelixRpcError | 429 received | endpoint, retryAfterMs |
| `HELIX_RPC_UNAVAILABLE` | HelixRpcError | 503 / ECONNREFUSED | endpoint |
| `HELIX_TX_TIMEOUT` | HelixTransactionTimeoutError | Confirmation wait exceeded | signature, elapsedMs, blockhash |
| `HELIX_TX_DROPPED` | HelixTransactionDroppedError | getSignatureStatuses = err | signature, slot, reason |
| `HELIX_TX_BLOCKHASH_EXPIRED` | HelixBlockhashExpiredError | lastValidBlockHeight exceeded | lastValidBlockHeight, currentSlot |
| `HELIX_TX_INSTRUCTION_ERROR` | HelixTransactionDroppedError | On-chain instruction failed | signature, instructionIndex, errorCode |
| `HELIX_JITO_BUNDLE_REJECTED` | HelixJitoBundleRejectedError | Bundle rejected by Jito | bundleId, reason |
| `HELIX_JITO_TIMEOUT` | HelixJitoBundleRejectedError | Bundle status timeout | bundleId, elapsedMs |
| `HELIX_FEE_ESTIMATION_FAILED` | HelixFeeEstimationError | All fee providers failed | providers[], lastError |
| `HELIX_WALLET_REJECTED` | HelixError (passthrough) | User rejected in wallet | walletError |
| `HELIX_ABORT` | HelixError | AbortSignal fired | signal.reason |

### 4.2 Error Debugging Flowchart

```
Error thrown?
    │
    ├─ Is it HelixConfigError?
    │   → Check constructor arguments. Run `helix-diag check <endpoint>` to validate.
    │
    ├─ Is it HelixPoolExhaustedError?
    │   → All endpoints failed. Check:
    │     1. Are endpoints accessible from your network?
    │     2. Run: helix-diag pool <ep1> <ep2> <ep3>
    │     3. Check RPC provider status pages
    │     4. Verify endpoint URLs include auth keys if required
    │
    ├─ Is it HelixTransactionTimeoutError?
    │   → Transaction may still land. DO NOT resend. Check:
    │     1. getSignatureStatuses([sig]) — did it confirm?
    │     2. Increase confirmationTimeout config
    │     3. Check network congestion — is mempool backed up?
    │
    ├─ Is it HelixBlockhashExpiredError?
    │   → Rebuild transaction with new blockhash. This is normal during congestion.
    │     If happening frequently: reduce time between tx build and send.
    │
    ├─ Is it HelixJitoBundleRejectedError?
    │   → Bundle dropped. Check:
    │     1. Was rpcFallback enabled? Did it fire?
    │     2. Was tip amount too low? Increase minTipLamports.
    │     3. Try different Jito regional endpoint.
    │
    └─ Is it passthrough wallet error?
        → User rejected the transaction. Surface to UI, don't retry.
```

---

## 5. DEBUGGING PROCEDURES BY COMPONENT

### 5.1 Debugging RPC Pool Issues

```bash
# Step 1: Verify each endpoint manually
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}' \
  https://your-endpoint.com

# Step 2: Run Helix diagnostic
helix-diag check https://your-endpoint.com --count 20

# Step 3: Test full pool
helix-diag pool https://ep1.com https://ep2.com https://ep3.com

# Step 4: Enable debug logging in SDK
const client = createHelixClient({
  ...config,
  logger: pino({ level: 'debug' }),
});

# Step 5: Watch pool events
client.on('healthChange', (endpoint, status) => {
  console.log(`Health change: ${endpoint} → ${status}`);
});
client.on('failover', (from, to) => {
  console.log(`Failover: ${from} → ${to}`);
});
```

**Common Pool Issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| All requests go to same endpoint | Weight/priority config wrong | Check endpoint priority values |
| Constant failovers | healthCheckTimeoutMs too low | Increase from 2000ms to 3000ms |
| 429 not triggering failover | retryableErrors missing HTTP_429 | Add to retryPolicy.retryableErrors |
| Endpoint never recovers | Health check disabled | Set healthCheckIntervalMs |
| Pool exhausted on startup | Wrong endpoint URL | Validate URLs with helix-diag check |

### 5.2 Debugging Transaction Issues

```typescript
// Enable full transaction trace
const sig = await client.sendAndConfirmTransaction(tx, {
  onRetry: (attempt, reason) => {
    console.log(`[TX] Retry ${attempt}: ${reason}`);
  },
  onConfirmation: (sig, slot) => {
    console.log(`[TX] Confirmed: ${sig} at slot ${slot}`);
  },
  onBlockhashExpiry: () => {
    console.warn('[TX] Blockhash expired — rebuilding transaction');
  },
});

// Manual signature check if transaction times out
const status = await client.getSignatureStatuses([timedOutSig]);
console.log(status.value[0]?.confirmationStatus); // null if not found
```

**Common Transaction Issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Blockhash not found" immediately | Building tx too far from send | Fetch blockhash just before signing |
| Low success rate in congestion | Priority fee too low | Enable dynamic fees, increase maxMicrolamports |
| Transaction never confirms | Wrong commitment level | Use 'confirmed' not 'processed' |
| InstructionError in transaction | On-chain logic rejected | Simulate before sending: simulateTransaction() |
| Duplicate transaction | Resend of confirmed tx | Check sig status before resending |
| Jito tip account invalid | Stale tip cache | Reduce tipAccountCacheTtlMs |

### 5.3 Debugging Jito Issues

```bash
# Test Jito endpoint directly
helix-diag jito --endpoint mainnet

# Check Jito status
curl https://mainnet.block-engine.jito.wtf/api/v1/bundles \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getTipAccounts","params":[]}'

# Debug tip account fetching
helix-diag jito --verbose
```

**Common Jito Issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Bundle always dropped | Tip too low | Use tipMode: 'dynamic', set higher minTip |
| getTipAccounts fails | Network/auth issue | Try alternate regional endpoint |
| Bundle timeout | 30s is tight for mainnet | Increase bundleTimeout to 45_000 |
| Fallback not activating | rpcFallback: false | Set rpcFallback: true |
| Bundle rejected immediately | tx signature invalid | Check signing flow before bundling |

### 5.4 Debugging Observability Issues

```typescript
// Verify OTel export is firing
const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 100 });
const provider = new MeterProvider({ readers: [reader] });
registerHelixMetrics(provider);

// After running some operations:
await reader.forceFlush();
const metrics = exporter.getMetrics();
console.log(JSON.stringify(metrics, null, 2));

// Should contain helix.rpc.latency_ms, helix.pool.healthy_nodes, etc.
```

**Common Observability Issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No metrics appearing | MeterProvider not registered | Call initHelixObservability() before operations |
| OTel collector not receiving | Wrong endpoint/auth | Check OTEL_EXPORTER_OTLP_ENDPOINT env var |
| Datadog not receiving | API key invalid or wrong site | Verify DD_API_KEY, set datadogSite config |
| Prometheus endpoint 404 | Port not open | Check prometheusPort config, firewall |
| Metrics delayed | exportIntervalMs too high | Reduce to 5000ms for near-realtime |

### 5.5 Debugging Coverage Gaps

```bash
# Generate coverage report with detailed breakdown
pnpm test --coverage --reporter=verbose

# Open HTML coverage report
open coverage/index.html

# Find specific uncovered lines
# coverage/packages/core/src/pool/RpcPool.ts.html
# Red lines = uncovered. Write tests for them.

# Check branch coverage specifically
pnpm test --coverage -- --coverage.branches 85
```

**Patterns for coverage gaps:**

```typescript
// GAP PATTERN 1: Error path not tested
// Uncovered: the catch block in FallbackChain.execute()
// FIX: Write a test that makes the operation throw

// GAP PATTERN 2: Optional callback not tested
// Uncovered: if (config.onFallback) { config.onFallback(from, to); }
// FIX: Write a test that passes onFallback callback and asserts it's called

// GAP PATTERN 3: Edge case not tested
// Uncovered: if (endpoints.length === 0) throw new HelixConfigError(...)
// FIX: Write a test that passes an empty endpoints array

// GAP PATTERN 4: Timeout branch not tested
// Uncovered: if (elapsed > config.timeout) reject(new HelixRpcError(...))
// FIX: Use vi.useFakeTimers() to fast-forward time
```

---

## 6. TESTING COMMANDS REFERENCE

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @helix-sdk/core test
pnpm --filter @helix-sdk/jito test

# Run specific test file
pnpm test packages/core/tests/pool.test.ts

# Run with coverage
pnpm test --coverage

# Run in watch mode (development)
pnpm test --watch

# Run simulation tests only
pnpm test --reporter=verbose packages/core/tests/simulation/

# Run with timeout extended (slow network simulation tests)
pnpm test --timeout 60000 packages/core/tests/simulation/

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run everything (full CI)
pnpm ci
```

---

## 7. CI TEST MATRIX

```yaml
# Every PR must pass ALL of these:

Node.js 20:
  - typecheck  ← 0 errors
  - lint       ← 0 warnings
  - test       ← all pass

Node.js 22:
  - test       ← all pass (compatibility check)

Coverage:
  - lines      ≥ 90%
  - branches   ≥ 85%
  - functions  ≥ 90%

Integration (devnet, on push to main only):
  - helix-diag check https://api.devnet.solana.com
  - Send test transaction on devnet
```

---

## 8. PERFORMANCE BENCHMARKS

Run these before release. If any fail, investigate and fix.

```typescript
// benchmark/rpc-pool.bench.ts
import { bench, describe } from 'vitest';

describe('RpcPool Routing Performance', () => {
  bench('weighted routing selection (1000 ops)', async () => {
    const pool = createTestPool(5); // 5 endpoints
    for (let i = 0; i < 1000; i++) {
      pool.selectEndpoint();
    }
  }, { time: 100 }); // Must complete 1000 ops in <100ms
  
  bench('health check evaluation', () => {
    const monitor = createTestHealthMonitor(10); // 10 endpoints
    monitor.evaluate();
  });
});

// Expected benchmarks:
// - Endpoint selection: <0.01ms per call
// - Retry delay calculation: <0.01ms per call
// - Metric emission: <0.5ms per call (OTel overhead)
// - SDK import time: <200ms (tree-shaking must work)
```

---

## 9. PRE-SUBMISSION DEBUG CHECKLIST

Run this checklist in order before every submission attempt:

```
PHASE 1: BASIC SANITY
□ pnpm install --frozen-lockfile          → no install errors
□ pnpm typecheck                          → 0 TypeScript errors
□ pnpm lint                               → 0 lint errors/warnings
□ pnpm build                             → all packages build cleanly
□ pnpm test                              → ALL tests pass (0 failing)
□ pnpm test --coverage                   → ≥90% line coverage

PHASE 2: FEATURE VERIFICATION
□ Create a test script: examples/smoke-test.ts
□ Run against devnet: pnpm tsx examples/smoke-test.ts
□ Verify: RpcPool routes requests across 3 devnet endpoints
□ Verify: Jito tip accounts fetched successfully
□ Verify: Fee estimate returned from at least one provider
□ Verify: OTel metrics emit to console exporter

PHASE 3: CLI VERIFICATION
□ npm install -g . (from packages/diagnostics)
□ helix-diag check https://api.devnet.solana.com
□ helix-diag pool https://api.devnet.solana.com https://api.mainnet-beta.solana.com
□ helix-diag metrics --format json → valid JSON
□ helix-diag metrics --format prometheus → valid Prometheus format
□ helix-diag --help → usage printed, exits 0

PHASE 4: DASHBOARD VERIFICATION
□ pnpm --filter dashboard dev → starts on localhost:3000
□ Open localhost:3000 → landing page loads
□ Navigate to /dashboard → metrics panel loads
□ WebSocket connects → metrics update in real time
□ No console errors in browser

PHASE 5: DOCS VERIFICATION
□ All examples in examples/ have working README.md
□ Root README.md covers: install, quick start, features, contributing
□ All packages have README.md
□ Architecture diagram renders correctly in GitHub

PHASE 6: FINAL CHECKS
□ No console.log statements in non-test code (grep -r "console.log" packages/*/src)
□ No 'any' types (grep -r ": any" packages/*/src)
□ No '// TODO' in shipped code (grep -r "TODO" packages/*/src)
□ All exported symbols have JSDoc (spot check 10 random exports)
□ .env.example committed, .env not committed
□ package.json versions consistent across packages
□ GitHub Actions CI green on main branch
□ Coverage badge in README links to correct report
```

---

## 10. KNOWN SOLANA DEVNET QUIRKS (Handle These)

```
1. Devnet slot lag: devnet can be 50+ slots behind mainnet expectations.
   Fix: don't compare slot numbers across networks.

2. Devnet RPC instability: api.devnet.solana.com is less reliable than mainnet.
   Fix: test against devnet with longer timeouts (10s vs 5s).

3. Devnet airdrop rate limit: max 2 SOL per request, max 1 request per 24h per address.
   Fix: use a pre-funded devnet keypair for tests, store in test fixtures.

4. Devnet blockhash staleness: devnet blockhashes expire at same rate but node
   disagreements happen more.
   Fix: always fetch fresh blockhash just before send in integration tests.

5. web3.js v2.0 address type: Address type won't accept arbitrary strings.
   Fix: always use address('...') constructor. Test with assertIsAddress().

6. Compute unit simulation on devnet may differ from mainnet.
   Fix: apply 20% buffer (instead of 10%) in integration test configs.
```

---

*DEBUG.md — No bug survives contact with this document.*
