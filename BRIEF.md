# BRIEF.md — Project Brief
## Helix SDK: Solana RPC & Transaction Reliability Infrastructure

**Bounty:** Superteam Ukraine — Build SDK that improves RPC and transaction reliability for Solana dApps
**Target Prize:** First Place
**Submission Deadline:** Per Superteam Ukraine bounty page
**Team:** Independent (solo or small team)

---

## 1. EXECUTIVE SUMMARY

Solana's throughput makes it the fastest L1 in production. But that raw speed means nothing when your dApp's RPC node returns a 429, your transaction lands in a dropped block, or a MEV bot sandwiches your user's swap for 3% slippage before it confirms. The Solana developer experience today asks every team to solve the same infrastructure problems from scratch: which RPC do I fall back to? How do I retry without double-spending? How do I know if my node is healthy before it ruins a user's transaction?

**Helix SDK solves this once, so no one has to solve it again.**

Helix is a TypeScript SDK for the Solana web3.js v2.0 ecosystem that layers production-grade RPC resilience, MEV protection, dynamic fee optimization, observability, and real-time monitoring on top of standard Solana primitives. A developer adds `@helix-sdk/core` to their project and immediately gains a fault-tolerant RPC pool, automatic Jito routing, and OpenTelemetry metrics — without changing how they write Solana code.

---

## 2. THE PROBLEM — WHAT DEVELOPERS ARE ACTUALLY SUFFERING

### 2.1 RPC Node Unreliability

Public Solana RPC endpoints are notoriously unstable:
- `api.mainnet-beta.solana.com` throttles aggressively — 100 req/10s per IP
- Rate limiting returns `429` silently or with confusing error messages
- Node restarts cause 30-second+ outages during high-traffic periods
- Latency spikes to 3000ms+ during validator leader schedule transitions
- Different nodes can disagree on slot height by 5-10 slots (causes `BlockhashNotFound`)

**Current developer solution:** Manually try-catch, hardcode a backup endpoint in their code, or pay $500+/mo for a dedicated RPC node. None of these are robust.

### 2.2 Transaction Dropping and MEV

Solana's parallel execution model creates unique transaction hazards:
- Dropped transactions: 15-20% of transactions don't land on first send during congestion
- No standard retry mechanism — devs poll `getSignatureStatuses` manually
- MEV bots front-run and sandwich DEX transactions on every major protocol
- Most dApps send directly to standard RPC, exposing all transactions to MEV
- Jito integration exists but requires non-trivial boilerplate every team reimplements

### 2.3 Zero Observability

Most Solana dApps operate completely blind:
- No metrics on which RPC endpoint is performing best
- No alerts when transaction success rate drops below threshold
- No latency percentile data to inform RPC tier decisions
- No transaction confirmation time distribution
- No automated detection of degraded RPC nodes

### 2.4 Fee Optimization Gap

Priority fees on Solana are poorly understood and frequently misused:
- Many dApps hardcode priority fees (either too low, causing drops; too high, wasting user funds)
- `getRecentPrioritizationFees` requires interpretation to be useful
- Compute unit limits are almost always hardcoded at 200,000 — 10x what the tx actually needs
- Helius and other providers offer better fee APIs that most devs don't know exist

### 2.5 web3.js v2.0 Migration Friction

Solana's web3.js v2.0 is a paradigm shift most developers are still navigating:
- Functional/modular API vs class-based v1
- Existing wallet adapters still target v1 types
- No established patterns for resilience layer integration with v2.0

---

## 3. THE SOLUTION — HELIX SDK

Helix SDK is a modular TypeScript package suite that addresses every one of these problems as a composable, layered system.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Your dApp / Protocol                     │
├─────────────────────────────────────────────────────────────┤
│              @helix-sdk/wallet-adapter                       │
│         (transparent resilience for wallet connectors)       │
├─────────────────────────────────────────────────────────────┤
│    @helix-sdk/core         │    @helix-sdk/jito             │
│    (RPC pool + failover)   │    (MEV relay + bundle)        │
├─────────────────────────────────────────────────────────────┤
│              @helix-sdk/fees                                 │
│         (dynamic fee estimation + CU simulation)            │
├─────────────────────────────────────────────────────────────┤
│              @helix-sdk/observability                        │
│         (OpenTelemetry + Datadog + Prometheus)              │
├─────────────────────────────────────────────────────────────┤
│              @helix-sdk/diagnostics (CLI)                    │
│         (terminal health checks + diagnostics)              │
└─────────────────────────────────────────────────────────────┘
         [Monitoring Dashboard — apps/dashboard]
```

### The Simplest Possible Integration

```typescript
// Before Helix (standard Solana code):
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
// If this endpoint fails, everything breaks.

// After Helix (3 lines to production-grade resilience):
import { createHelixClient } from '@helix-sdk/core';
const helix = createHelixClient({
  endpoints: ['https://helius.rpc', 'https://quicknode.rpc', 'https://api.mainnet-beta.solana.com'],
  jito: { enabled: true, minTipLamports: 1000n },
  fees: { mode: 'dynamic', maxMicrolamports: 1_000_000 },
  observability: { otel: true, datadog: { enabled: true, apiKey: process.env.DD_API_KEY } },
});
// Now every transaction is: MEV-protected, fee-optimized, auto-retried,
// load-balanced, observed, and resilient to node failures.
```

---

## 4. TARGET USERS (ICP — Ideal Customer Profiles)

### ICP 1: Solana DeFi Protocol Team
- Building: DEX, lending protocol, yield aggregator
- Pain: MEV sandwich attacks, RPC failures during high volume, opaque transaction failure rates
- Value from Helix: Jito bundle routing eliminates MEV, pool failover prevents outages, metrics reveal drop rates
- Adoption trigger: A production incident where their main RPC rate-limited them and users lost money

### ICP 2: Solana Game / NFT Platform Developer
- Building: On-chain game, NFT minting dApp, launchpad
- Pain: Mint failures during traffic spikes, users losing SOL to failed transactions, no visibility
- Value from Helix: TransactionSender with retry handles mint congestion, dashboard shows queue health
- Adoption trigger: A mint event with 30% transaction failure rate

### ICP 3: Solana Wallet or Account Abstraction Team
- Building: Mobile wallet, browser extension, embedded wallet SDK
- Pain: Unreliable confirms on mobile networks, user frustration with dropped transactions
- Value from Helix: Wallet adapter plugin adds resilience without code changes, confirmation polling with fallback
- Adoption trigger: User reviews complaining about failed transactions

### ICP 4: Solana Indexer / Data Infrastructure Developer
- Building: Indexers, data pipelines, analytics platforms
- Pain: RPC disruptions break data pipelines, no alerting on node health
- Value from Helix: Metrics export to Datadog/OTel powers existing observability stacks
- Adoption trigger: A critical outage caused by a silent RPC node failure

### ICP 5: Hackathon / Indie Solana Builder (bounty judges' peer)
- Building: New dApp prototype competing in a hackathon
- Pain: No time to build proper resilience, RPC issues waste dev time
- Value from Helix: One-import solution to all RPC problems, devnet diagnostics CLI
- Adoption trigger: Discovering Helix in the Superteam bounty list

---

## 5. COMPETITIVE LANDSCAPE

| Solution | RPC Failover | MEV Protection | Observability | web3.js v2 | Open Source | Verdict |
|---|---|---|---|---|---|---|
| **Helix SDK** | ✅ Pool + weights | ✅ Jito native | ✅ OTel + DD | ✅ Full | ✅ | **This project** |
| Alchemy SDK | Partial (1 endpoint) | ❌ | Alchemy dashboard only | ❌ (v1 only) | ❌ | Vendor lock-in |
| Helius SDK | Partial | ❌ | Helius dashboard only | Partial | Partial | Single vendor |
| QuickNode SDK | Partial | ❌ | QuickNode only | ❌ | ❌ | Proprietary |
| solana-retry-utils | Basic retry only | ❌ | ❌ | ❌ | ✅ | Abandoned |
| DIY implementation | Team-by-team | Team-by-team | None | Varies | N/A | Hours of work per team |
| Jito TypeScript SDK | ❌ | ✅ | ❌ | Partial | ✅ | MEV only, no resilience |

**Helix is the first open-source, vendor-neutral, web3.js v2.0-native resilience SDK for Solana with full-stack observability.**

---

## 6. SUCCESS METRICS

### Bounty Submission Metrics (must hit ALL)

| Metric | Target | How Verified |
|---|---|---|
| web3.js v2.0 compat | 100% of tests use v2 API | `tsc --noEmit` + test suite |
| Wallet adapter | Phantom integration | Integration test with mock wallet |
| Jito/MEV routing | Implemented + documented | Jito unit tests pass + README section |
| OTel export | Metrics flow to OTel collector | Test: assert metric name + value |
| Datadog export | Metrics flow to Datadog | Test: assert DD API call format |
| Diagnostics CLI | All 5 commands functional | CLI integration tests pass |
| Test coverage | ≥90% lines | Vitest coverage report |
| Network simulation | Drop, rate-limit, latency tests | All simulation tests pass |

### Product Quality Metrics (differentiators for judges)

| Metric | Target |
|---|---|
| RPC failover time | <100ms p99 |
| Transaction retry success rate | >99% on devnet |
| Fee estimation accuracy | Within 20% of actual needed fee |
| CLI cold start time | <500ms |
| Dashboard render time | <2s initial load |
| SDK bundle size (@helix-sdk/core) | <50KB minified+gzipped |
| TypeScript type coverage | 100% (no `any`) |

---

## 7. TECHNICAL CONSTRAINTS & DECISIONS

### Constraint: web3.js v2.0 Only
The bounty explicitly requires v2.0 compatibility. All SDK code uses the functional v2.0 API. Wallet adapter package may bridge v1 wallet types but exposes v2.0 interfaces.

### Constraint: Open Source
All code must be in a public GitHub repository. No proprietary dependencies.

### Constraint: No Vendor Lock-in
The SDK works with any combination of RPC providers. No required accounts, API keys, or paid services. Helius, Datadog, etc. are optional integrations with open fallbacks.

### Decision: pnpm + Turborepo
Turborepo caches build outputs, dramatically speeding up CI. pnpm workspaces handles cross-package dependencies. This is industry standard for TypeScript monorepos.

### Decision: Vitest over Jest
Vitest has native ESM support (required by web3.js v2.0), 2-5x faster test execution, and first-class TypeScript support with no transpile step.

### Decision: MSW for RPC Mocking
Mock Service Worker (MSW) intercepts HTTP requests at the network level, allowing realistic simulation of RPC endpoint behavior including timeouts, 429s, and connection failures — without any actual network calls.

---

## 8. DELIVERY PLAN

### Day 1-2: Foundation
- Monorepo scaffold, CI/CD, type configs
- `@helix-sdk/core` — RpcPool, FallbackChain, RetryPolicy

### Day 3-4: Resilience Core
- `@helix-sdk/core` — TransactionSender, BlockhashCache, ConfirmationPoller
- `@helix-sdk/jito` — JitoClient, TipOracle, BundleTracker

### Day 5-6: Features
- `@helix-sdk/fees` — FeeOracle, simulation engine
- `@helix-sdk/wallet-adapter` — Phantom integration
- `@helix-sdk/observability` — OTel + Datadog

### Day 7: Dashboard & CLI
- `@helix-sdk/diagnostics` — CLI with all 5 commands
- `apps/dashboard` — Next.js monitoring dashboard

### Day 8-9: Testing
- Network simulation tests
- Coverage push to 90%+
- DEBUG.md full checklist run

### Day 10: Polish & Submit
- Documentation pass
- Example apps verified on devnet
- GitHub repo cleaned, README polished
- Submission filed

---

## 9. RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Jito API changes | Low | High | Pin Jito client to specific API version, abstract behind interface |
| web3.js v2.0 breaking change | Low | High | Pin exact version in workspace root |
| MSW doesn't support Solana JSON-RPC | Low | Medium | Custom MSW handler for Solana RPC methods |
| Test coverage falls short of 90% | Medium | High | Track coverage from Day 1, fix gaps before final days |
| Vitest ESM issues with Solana v2 | Medium | Medium | Test setup early, configure vitest.config for ESM |
| Dashboard WebSocket complexity | Medium | Low | Ship simple polling fallback if WebSocket proves complex |
| Single person bandwidth | High | Medium | Prioritize: core → jito → fees → observability → CLI → dashboard |

---

*Helix SDK — One import. Zero dropped transactions. Full visibility.*
