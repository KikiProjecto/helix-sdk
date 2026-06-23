# Helix SDK

[![CI](https://github.com/KikiProjecto/helix-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/KikiProjecto/helix-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![npm @helix-sdk/core](https://img.shields.io/npm/v/@helix-sdk/core?color=purple)](https://www.npmjs.com/package/@helix-sdk/core)
[![TypeScript 5.x](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Helix is a production-grade + systems-level TypeScript SDK built on the functional and modular **Solana web3.js v2.0** API. It protects decentralized applications from RPC node failures, rate-limiting, transaction dropping, and MEV frontrunning.

<div align="center">
  <img src="visual/preview.gif" alt="helix daemon" width="100% />
</div>

---

## Monorepo Packages

Helix is organized as a pnpm workspace monorepo ;

| Package | Directory | Description |
|---|---|---|
| **`@helix-sdk/core`** | [`packages/core`](./packages/core) | Fault-tolerant RPC connection pool, weighted routing, health monitor, fallback chains, blockhash cache, and transaction confirmation. |
| **`@helix-sdk/jito`** | [`packages/jito`](./packages/jito) | Jito block engine bundle integration, dynamic tip oracle, bundle tracker, and standard RPC fallback. |
| **`@helix-sdk/fees`** | [`packages/fees`](./packages/fees) | Dynamic priority fee estimates (Helius/Native), compute unit simulations, and compute budget instructions builder. |
| **`@helix-sdk/wallet-adapter`** | [`packages/wallet-adapter`](./packages/wallet-adapter) | Interceptor plugin for standard Solana wallet adapters, transparently injecting fees, Jito routing, and retries. |
| **`@helix-sdk/observability`** | [`packages/observability`](./packages/observability) | OpenTelemetry integration, Prometheus scraping endpoint, and Datadog Metrics/Traces export. |
| **`@helix-sdk/diagnostics`** | [`packages/diagnostics`](./packages/diagnostics) | Command-line utility (`helix-diag`) to perform RPC checks, test pool failover, send devnet transactions, and test Jito engine integration. |
| **`apps/dashboard`** | [`apps/dashboard`](./apps/dashboard) | Real-time monitoring dashboard displaying node latency sparklines, live transaction streams, and pool alerts. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Your dApp / Protocol                    │
├─────────────────────────────────────────────────────────────┤
│                  @helix-sdk/wallet-adapter                  │
│        (transparent resilience for wallet connectors)       │
├─────────────────────────────────────────────────────────────┤
│       @helix-sdk/core       │       @helix-sdk/jito         │
│    (RPC pool + failover)    │     (MEV relay + bundle)      │
├─────────────────────────────────────────────────────────────┤
│                    @helix-sdk/fees                          │
│          (dynamic fee estimation + CU simulation)           │
├─────────────────────────────────────────────────────────────┤
│                  @helix-sdk/observability                   │
│            (OpenTelemetry + Datadog + Prometheus)           │
├─────────────────────────────────────────────────────────────┤
│                 @helix-sdk/diagnostics (CLI)                │
│            (terminal health checks + diagnostics)           │
└─────────────────────────────────────────────────────────────┘
             [Monitoring Dashboard — apps/dashboard]
```

---

## Quick Start

Get started in three lines of code:

```typescript
import { createHelixClient } from '@helix-sdk/core';

const helix = createHelixClient({
  endpoints: [
    { url: 'https://your-helius-endpoint.rpc', weight: 2.0 },
    { url: 'https://your-quicknode-endpoint.rpc', weight: 1.0 },
    { url: 'https://api.mainnet-beta.solana.com', weight: 0.5 }
  ],
  jito: { enabled: true, minTipLamports: 1000n },
  fees: { mode: 'dynamic' },
  observability: { otel: true }
});
```


