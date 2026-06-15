# AGENTS.md — Master Orchestration File
## ⚡ READ THIS FIRST. ALWAYS. BEFORE EVERY OTHER FILE. BEFORE EVERY LINE OF CODE.

---

## 0. PRIME DIRECTIVE

You are building **Helix SDK** — a systems-grade TypeScript SDK that makes Solana dApps bulletproof against RPC failures, rate limiting, dropped transactions, and MEV attacks. This is a **Superteam Ukraine hackathon submission** targeting first place. You are not writing a prototype. You are not writing a demo. You are writing **production-deployable infrastructure** that Solana developers worldwide will depend on.

**Your standard is: would a senior Solana engineer at Jito, Helius, or Anza trust this in production? If no, rewrite it.**

You must:
- Write zero placeholder code. Every exported function is fully implemented.
- Maintain TypeScript `strict: true` at all times. No `any`. No `@ts-ignore`. No `as unknown as X`.
- Achieve 90%+ test coverage. Every failure case is tested. Every retry path is exercised.
- Follow the Solana web3.js v2.0 **functional, modular** API exclusively. The old class-based v1 API is forbidden.
- Never leave a `// TODO` in code that ships. Implement it or remove it.
- Document every exported symbol with JSDoc including `@param`, `@returns`, `@throws`, and `@example`.

---

## 1. MANDATORY FILE READING ORDER

Before writing a single line of code or config, read every file in this sequence:

| Order | File | Why |
|-------|------|-----|
| 1 | `AGENTS.md` (this file) | Mission, workflow, Solana knowledge, agent rules |
| 2 | `BRIEF.md` | Problem context, users, success criteria, competitive landscape |
| 3 | `PRD.md` | Full technical specification, architecture, every feature, infrastructure |
| 4 | `DESIGN.md` | Visual language, component specs, motion rules (for dashboard & docs site) |
| 5 | `DEBUG.md` | Testing matrix, error catalog, network simulation, debugging runbook |

**If you are about to touch a file covered by a markdown you have not read — STOP. Read that markdown first.**

---

## 2. PROJECT IDENTITY

| Field | Value |
|-------|-------|
| **Project Name** | Helix SDK |
| **Package Namespace** | `@helix-sdk/` |
| **Bounty** | Superteam Ukraine — Solana RPC & Transaction Reliability SDK |
| **Prize Target** | First Place ($700+) |
| **Core Language** | TypeScript 5.x, `strict: true` |
| **Runtime Targets** | Node.js 20 LTS, Bun 1.x |
| **Solana SDK Version** | `@solana/web3.js` **v2.0** (functional/modular) — NOT v1 |
| **Test Framework** | Vitest 2.x |
| **Monorepo Tool** | pnpm workspaces + Turborepo |
| **Observability** | OpenTelemetry SDK + Datadog Agent |
| **Monitoring Dashboard** | Next.js 15, App Router, Tailwind CSS v4 |
| **CLI** | Commander.js + Ink (React CLI) |

---

## 3. SOLANA ECOSYSTEM KNOWLEDGE — MASTER THIS BEFORE TOUCHING CODE

### 3.1 web3.js v2.0 — The Paradigm Shift (CRITICAL)

v2.0 is a **complete architectural rewrite**. It is tree-shakeable, functional, and modular. The class-based `Connection`, `Transaction`, `PublicKey` API from v1 is **dead**. Using it is an automatic disqualification.

**❌ FORBIDDEN (v1 patterns):**
```typescript
import { Connection, Transaction, PublicKey } from '@solana/web3.js';
const conn = new Connection(endpoint);
const tx = new Transaction();
tx.add(instruction);
await conn.sendTransaction(tx, [signer]);
```

**✅ REQUIRED (v2.0 patterns):**
```typescript
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  appendTransactionMessageInstruction,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  pipe,
  address,
  lamports,
} from '@solana/web3.js';

const rpc = createSolanaRpc(endpoint);
const rpcSubscriptions = createSolanaRpcSubscriptions(wsEndpoint);

const tx = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(signer, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  tx => appendTransactionMessageInstruction(instruction, tx),
);

const signedTx = await signTransactionMessageWithSigners(tx);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
const sig = await sendAndConfirm(signedTx, { commitment: 'confirmed' });
```

**v2.0 Key Types to know:**
- `Address` — replaces `PublicKey`. Created with `address('...')`.
- `Lamports` — branded number type. Created with `lamports(BigInt(value))`.
- `TransactionMessage` — replaces `Transaction`. Immutable.
- `SignedTransaction` — replaces signed `Transaction`.
- `Commitment` — `'processed' | 'confirmed' | 'finalized'`
- `RpcSubscriptions` — replaces `Connection` WebSocket methods.
- `sendAndConfirmTransactionFactory` — factory for sending + confirming in one call.

### 3.2 Jito MEV Block Engine

Jito Labs operates the dominant MEV relay infrastructure on Solana mainnet.

**Key Concepts:**
- **Bundle**: 1–5 transactions submitted atomically. Either all land or none do.
- **Tip**: A lamport transfer to one of 8 rotating tip accounts. Required for bundles to be accepted.
- **getTipAccounts()**: RPC call that returns the 8 current tip accounts.
- **sendBundle()**: Submit a bundle. Returns bundle UUID.
- **getBundleStatuses()**: Poll bundle landing status with the UUID.

**Jito Regional Block Engine Endpoints:**
```
mainnet: https://mainnet.block-engine.jito.wtf/api/v1/transactions
ny:      https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions
amsterdam: https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions
frankfurt: https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions
tokyo:   https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions
```

**MEV Protection Logic:**
- Submit transactions via Jito first (sandwich protection, frontrun resistance)
- If Jito submission fails or times out after 5s → fall back to standard RPC send
- Always include tip (minimum 1000 lamports, dynamic recommended tip from fee oracle)

### 3.3 RPC Failure Modes — Know These Cold

| Failure Mode | HTTP Code / Error | Helix Response |
|---|---|---|
| Rate limit | 429 Too Many Requests | Backoff + route to next node |
| Node unavailable | 503 / ECONNREFUSED | Remove from pool, failover |
| Slow response | Latency > threshold | Shadow traffic to backup node |
| Stale slot | SlotNotAvailable | Refresh blockhash, retry |
| Block height exceeded | BlockhashNotFound | Rebuild tx with new blockhash |
| Signature rejected | SendTransactionError | Log, alert, surface to caller |
| WebSocket disconnect | WSEP 1006 | Reconnect with exponential backoff |
| Timeout | AbortError | Mark node degraded, failover |

### 3.4 Transaction Lifecycle (Full)

```
[Build] → createTransactionMessage + pipe transformations
[Blockhash] → getLatestBlockhash() → attach to message
[Sign] → signTransactionMessageWithSigners()
[Send] → Route via Jito bundle OR direct RPC
[Confirm] → WebSocket subscription OR polling loop
[Finality] → 'confirmed' (32 slots) or 'finalized' (67%+ stake)
[Expiry] → If > ~150 slots (≈90s) since blockhash, tx is dead → rebuild
```

### 3.5 Dynamic Priority Fees

Priority fees (compute unit price in microlamports) are critical for tx landing speed.

```typescript
// Sources in priority order:
// 1. Helius getPriorityFeeEstimate (most accurate per-program)
// 2. getRecentPrioritizationFees() RPC method (standard)
// 3. Fallback: hardcoded floor (5000 microlamports)

// Compute unit limit: ALWAYS simulate first
const simulation = await rpc.simulateTransactionMessage(tx).send();
const computeUnits = simulation.value.unitsConsumed;
const budgetedUnits = Math.ceil(computeUnits * 1.1); // 10% buffer
```

### 3.6 RPC Metrics to Track

Every RPC call emits these metrics:
- `helix.rpc.latency_ms` — histogram
- `helix.rpc.error_rate` — gauge per endpoint
- `helix.rpc.success_rate` — gauge per endpoint
- `helix.rpc.requests_total` — counter with labels: `method`, `endpoint`, `status`
- `helix.tx.confirmation_time_ms` — histogram
- `helix.tx.send_attempts` — counter
- `helix.tx.retry_count` — histogram
- `helix.tx.dropped_count` — counter
- `helix.pool.healthy_nodes` — gauge
- `helix.pool.degraded_nodes` — gauge

---

## 4. AGENT WORKFLOW — EXECUTE IN ORDER

### Phase 0: Context Load (before ANY code)
```
□ Read AGENTS.md (this file)
□ Read BRIEF.md
□ Read PRD.md
□ Read DESIGN.md
□ Read DEBUG.md
□ Write a 3-sentence summary of the project to confirm comprehension
```

### Phase 1: Monorepo Scaffold
```
□ Initialize pnpm workspace with turbo
□ Configure tsconfig.base.json with strict settings
□ Configure ESLint (TypeScript + import rules)
□ Configure Vitest with v8 coverage
□ Set up GitHub Actions CI pipeline (see PRD.md §CI/CD)
□ Create package.json for each workspace package
□ Create root README.md
```

### Phase 2: Core SDK — @helix-sdk/core
```
□ RpcPool class — manages pool of N endpoints
□ EndpointHealthMonitor — latency + error rate per endpoint
□ FallbackChain — ordered retry with per-endpoint weight
□ HelixRpcClient — wraps createSolanaRpc with resilience
□ RetryPolicy — exponential backoff with jitter + abort signal
□ BlockhashCache — cached with TTL + pre-fetch
□ TransactionSender — send + confirm with auto-retry on expiry
□ Unit tests: mock all RPC calls via MSW
□ Test: 429 → rotate to next endpoint
□ Test: 503 → mark degraded, failover
□ Test: timeout → AbortController signal propagation
□ Test: blockhash expiry → rebuild and resend
```

### Phase 3: MEV Layer — @helix-sdk/jito
```
□ JitoClient — bundle construction and submission
□ TipOracle — fetches and caches tip accounts
□ BundleTracker — polls getBundleStatuses
□ JitoFallbackSender — Jito → RPC fallback chain
□ Unit tests: mock Jito endpoints via MSW
□ Test: bundle accepted → confirmed
□ Test: bundle dropped → fallback to RPC
□ Test: tip account rotation
□ Test: regional endpoint fallback
```

### Phase 4: Fee Layer — @helix-sdk/fees
```
□ FeeOracle — multi-source fee estimation
□ HeliusFeeProvider — Helius getPriorityFeeEstimate integration
□ NativeFeeProvider — getRecentPrioritizationFees fallback
□ ComputeBudgetInstructions — SetComputeUnitLimit + SetComputeUnitPrice builders
□ SimulationEngine — simulate tx to get actual compute units
□ Unit tests: mock fee APIs
□ Test: Helius API down → fallback to native
□ Test: fee capping at configurable max
```

### Phase 5: Wallet Adapter — @helix-sdk/wallet-adapter
```
□ HelixWalletAdapterPlugin — wraps standard wallet adapter
□ ResilienceMiddleware — intercepts sendTransaction, adds retry
□ Phantom, Solflare adapter integration tests
□ Unit tests: mock wallet connector
□ Test: sendTransaction intercepted and enhanced
□ Test: wallet signature rejection propagated cleanly
```

### Phase 6: Observability — @helix-sdk/observability
```
□ HelixMeterProvider — configures OTel MeterProvider
□ HelixTracerProvider — configures OTel TracerProvider
□ DatadogExporter — OTel → Datadog bridge
□ PrometheusExporter — /metrics endpoint for scraping
□ MetricEmitter — emits all helix.* metrics (see §3.6 above)
□ SpanDecorator — wraps RPC calls in OTel spans
□ Unit tests: assert metric values on mock calls
□ Test: Datadog exporter serializes correct metric format
□ Test: OTel span attributes populated correctly
```

### Phase 7: Diagnostics CLI — @helix-sdk/diagnostics
```
□ CLI binary: `helix-diag`
□ Commands:
  helix-diag check <endpoint>       — latency + health check
  helix-diag pool <...endpoints>    — test full pool failover
  helix-diag tx <rpc> <keypair>     — send test devnet tx, report latency
  helix-diag jito                   — test Jito tip fetch + bundle sim
  helix-diag metrics                — dump current metrics snapshot
□ Output: color-coded terminal table (ink + cli-table3)
□ Integration tests: spawn CLI process, assert stdout
```

### Phase 8: Monitoring Dashboard — apps/dashboard
```
□ Scaffold Next.js 15 App Router project
□ Implement per DESIGN.md — hero IS the live terminal
□ WebSocket server (Fastify WS) streaming metrics feed
□ RPC Health Panel — per-endpoint latency sparklines
□ Transaction Stream — live confirmed tx feed
□ Pool Status Map — node grid with health indicators
□ Alert Panel — degraded/failed endpoint alerts
□ Dark mode only (no light mode toggle needed)
□ E2E tests: Playwright
```

### Phase 9: Testing — Hit 90%+
```
□ Run: pnpm test --coverage
□ Target: 90%+ lines, 85%+ branches
□ Network simulation tests: see DEBUG.md §5
□ Fix all uncovered branches
□ Run DEBUG.md complete checklist
□ Generate coverage report, include in README
```

### Phase 10: Documentation & Polish
```
□ README.md per package (installation, quick start, API reference)
□ Root README.md (monorepo overview, architecture diagram, badges)
□ docs/ folder: getting-started, api-reference, architecture
□ CHANGELOG.md
□ GitHub Actions: badge-worthy CI green
□ Tag v0.1.0 release
□ Verify all submission requirements (see PRD.md §Submission)
```

---

## 5. FULL DIRECTORY STRUCTURE

```
helix-sdk/
├── AGENTS.md                       ← YOU ARE HERE
├── PRD.md
├── BRIEF.md
├── DESIGN.md
├── DEBUG.md
│
├── package.json                    ← workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc
├── vitest.config.ts                ← root coverage config
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  ← lint + type-check + test
│       ├── release.yml             ← publish to npm on tag
│       └── coverage.yml            ← coverage report + badge
│
├── packages/
│   ├── core/                       ← @helix-sdk/core
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── pool/
│   │   │   │   ├── RpcPool.ts
│   │   │   │   ├── EndpointHealthMonitor.ts
│   │   │   │   └── FallbackChain.ts
│   │   │   ├── client/
│   │   │   │   ├── HelixRpcClient.ts
│   │   │   │   └── RetryPolicy.ts
│   │   │   ├── transaction/
│   │   │   │   ├── TransactionSender.ts
│   │   │   │   ├── BlockhashCache.ts
│   │   │   │   └── ConfirmationPoller.ts
│   │   │   ├── errors/
│   │   │   │   └── HelixErrors.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   ├── tests/
│   │   │   ├── pool.test.ts
│   │   │   ├── client.test.ts
│   │   │   ├── transaction.test.ts
│   │   │   └── simulation/
│   │   │       ├── network-drop.test.ts
│   │   │       ├── rate-limit.test.ts
│   │   │       └── latency-spike.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── jito/                       ← @helix-sdk/jito
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── JitoClient.ts
│   │   │   ├── TipOracle.ts
│   │   │   ├── BundleTracker.ts
│   │   │   └── JitoFallbackSender.ts
│   │   ├── tests/
│   │   │   ├── jito-client.test.ts
│   │   │   ├── tip-oracle.test.ts
│   │   │   └── bundle-fallback.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── fees/                       ← @helix-sdk/fees
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── FeeOracle.ts
│   │   │   ├── providers/
│   │   │   │   ├── HeliusFeeProvider.ts
│   │   │   │   └── NativeFeeProvider.ts
│   │   │   ├── ComputeBudgetBuilder.ts
│   │   │   └── SimulationEngine.ts
│   │   ├── tests/
│   │   │   ├── fee-oracle.test.ts
│   │   │   └── simulation.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── wallet-adapter/             ← @helix-sdk/wallet-adapter
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── HelixWalletAdapterPlugin.ts
│   │   │   └── ResilienceMiddleware.ts
│   │   ├── tests/
│   │   │   └── wallet-adapter.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── observability/              ← @helix-sdk/observability
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── HelixMeterProvider.ts
│   │   │   ├── HelixTracerProvider.ts
│   │   │   ├── exporters/
│   │   │   │   ├── DatadogExporter.ts
│   │   │   │   └── PrometheusExporter.ts
│   │   │   ├── MetricEmitter.ts
│   │   │   └── SpanDecorator.ts
│   │   ├── tests/
│   │   │   ├── metrics.test.ts
│   │   │   ├── tracing.test.ts
│   │   │   └── exporters.test.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── diagnostics/               ← @helix-sdk/diagnostics
│       ├── src/
│       │   ├── index.ts
│       │   ├── cli.ts             ← entry point (#!/usr/bin/env node)
│       │   ├── commands/
│       │   │   ├── check.ts
│       │   │   ├── pool.ts
│       │   │   ├── tx.ts
│       │   │   ├── jito.ts
│       │   │   └── metrics.ts
│       │   └── ui/
│       │       ├── HealthTable.tsx
│       │       └── TxReport.tsx
│       ├── tests/
│       │   └── cli.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
│
├── apps/
│   └── dashboard/                 ← Real-time monitoring dashboard
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   └── api/
│       │   │       └── metrics/route.ts
│       │   ├── components/
│       │   │   ├── RpcHealthPanel.tsx
│       │   │   ├── TxStreamPanel.tsx
│       │   │   ├── PoolStatusGrid.tsx
│       │   │   ├── AlertBanner.tsx
│       │   │   └── LiveTerminal.tsx
│       │   ├── hooks/
│       │   │   └── useMetricsSocket.ts
│       │   └── lib/
│       │       └── metricsServer.ts
│       ├── tests/
│       │   └── e2e/
│       │       └── dashboard.spec.ts
│       └── package.json
│
├── examples/
│   ├── basic-usage/
│   │   ├── index.ts
│   │   └── README.md
│   ├── jito-bundle/
│   │   ├── index.ts
│   │   └── README.md
│   └── custom-rpc-pool/
│       ├── index.ts
│       └── README.md
│
└── docs/
    ├── getting-started.md
    ├── api-reference.md
    ├── architecture.md
    └── network-simulation.md
```

---

## 6. CODE QUALITY ENFORCEMENT

Every file you produce MUST pass ALL of these before being considered done:

```
□ tsc --noEmit → 0 errors
□ eslint . → 0 warnings, 0 errors
□ vitest run → all tests pass
□ vitest run --coverage → ≥90% line coverage
□ No `any` types (use TypeScript generics or proper union types)
□ No `// TODO` or `// FIXME` (implement it or remove it)
□ No `console.log` (import from logger utility)
□ Every exported function has JSDoc with @param, @returns, @throws, @example
□ Every error thrown is a typed class extending HelixError
□ Every async function handles the AbortSignal pattern
□ Every RPC operation emits a metric span
```

---

## 7. SOLANA-SPECIFIC AGENT RULES

1. **NEVER use v1 API.** `Connection`, `Transaction`, `PublicKey` — all forbidden.
2. **ALWAYS handle blockhash expiry.** If `BlockhashNotFound`, get a new blockhash and retry.
3. **ALWAYS compute unit simulate first.** Never hardcode compute units.
4. **ALWAYS include MEV protection.** Route through Jito first, RPC second.
5. **ALWAYS validate addresses with `isAddress()` before use.** Never assume strings are valid.
6. **ALWAYS use `Commitment: 'confirmed'` minimum** for read-after-write operations.
7. **ALWAYS propagate `AbortSignal` from the caller** through all async operations.
8. **ALWAYS implement connection pooling health checks.** Dead endpoints get removed from pool within 1 missed health check cycle.
9. **ALWAYS emit OTel spans.** If you add a code path, you add a span.
10. **ALWAYS write a test.** If you implement a function, you test every branch of that function.

---

## 8. DECISION RULES (for ambiguous choices)

**When in doubt about architecture:** Choose the option that is more resilient, not the one that is simpler.

**When in doubt about API design:** Choose the option a developer would find intuitive. Clean signatures beat clever ones.

**When in doubt about error handling:** Surface the error to the caller with full context. Never silently swallow errors.

**When in doubt about testing:** Write the test. Over-testing is not a problem. Under-testing loses the bounty.

**When in doubt about types:** Create a precise type. Do not use `any`, do not use `object`, do not use `Record<string, unknown>` when you can be specific.

**When you encounter a TypeScript error you cannot immediately solve:** Look at the @solana/web3.js v2.0 type definitions in node_modules. Do not cast away the error — understand it.

---

## 9. BOUNTY SCORING — AGENT OPTIMIZATION TARGETS

| Criterion | Weight | Agent Must Deliver |
|---|---|---|
| **Correctness** | 40% | ALL 7 features working under simulated failure. Not just happy path. |
| **Resilience Quality** | 25% | RPC failover in <100ms. Zero dropped txs on node failure. |
| **Developer Experience** | 20% | One-line import, intuitive API, full TypeScript intellisense |
| **Test Coverage + Simulation** | 15% | ≥90% coverage. Chaos tests. Network condition simulation. |

**The judges will test failure conditions.** Build every fallback. Test every edge case.

---

## 10. SUBMISSION CHECKLIST (verify before submitting)

```
□ Public GitHub repo with all source code
□ web3.js v2.0 compatibility verified with tests (see PRD.md §Submission)
□ Wallet adapter integration with Phantom (major wallet)
□ Jito/MEV routing implemented and documented in README
□ Observability exports working — OTel metrics export verified in test
□ helix-diag CLI builds and all commands functional
□ 90%+ test coverage — CI badge green
□ Network simulation tests (network-drop, rate-limit, latency-spike) all pass
□ Dashboard deployable (Vercel or Docker)
□ README contains architecture diagram and quick-start < 5 min
□ All examples (basic-usage, jito-bundle, custom-rpc-pool) run on devnet
```

---

## 11. FINAL AGENT DIRECTIVES — INTERNALIZE THESE

1. **READ ALL MARKDOWNS BEFORE CODING.** This is not a suggestion.
2. **BUILD FOR PRODUCTION.** Every edge case. Every error path.
3. **MAXIMIZE RESILIENCE.** If one thing fails, the next thing catches it. Always.
4. **TYPE EVERYTHING PRECISELY.** Generics over any. Always.
5. **TEST EVERYTHING.** If it isn't tested it doesn't exist and it doesn't win.
6. **DOCUMENT EVERYTHING.** Every package has a README. Every function has JSDoc.
7. **FIRST PLACE IS THE ONLY PLACE.** Build accordingly.

---

*Helix SDK — Built to win. Built to last.*
