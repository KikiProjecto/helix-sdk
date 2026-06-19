# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-06-16

### Initial Release

First public release of Helix SDK submitted to Superteam Ukraine Solana RPC
Reliability Bounty.

#### Added

**@helix-sdk/core**
- RPC pool with weighted failover routing
- Endpoint health monitoring with latency percentile tracking
- Fallback chain with exponential backoff and jitter
- HelixRpcClient wrapper for resilience
- TransactionSender with automatic confirmation polling
- BlockhashCache with prefetch strategy
- Complete error class hierarchy
- 90%+ test coverage including network simulation tests

**@helix-sdk/jito**
- JitoClient for bundle submission to Jito block engine
- Support for all 6 regional Jito endpoints
- TipOracle for dynamic tip recommendations
- BundleTracker for bundle status polling
- Automatic fallback to standard RPC on bundle rejection
- Full Jito API integration and testing

**@helix-sdk/fees**
- FeeOracle with multi-source fee estimation
- Helius priority fee API integration
- Native getRecentPrioritizationFees fallback
- ComputeBudgetBuilder for CU limit/price instructions
- SimulationEngine for accurate compute unit calculation
- Dynamic fee estimation with configurable caps

**@helix-sdk/wallet-adapter**
- HelixWalletAdapterPlugin for transparent resilience injection
- Phantom wallet adapter integration (tested)
- Automatic compute budget and Jito tip injection
- Wallet disconnect lifecycle management
- Zero changes required to existing dApp code

**@helix-sdk/observability**
- Custom OTel MeterProvider with standard metrics
- Custom OTel TracerProvider with span instrumentation
- DatadogExporter for Datadog metrics push
- PrometheusExporter for Prometheus scrape endpoint
- MetricEmitter for manual metric recording
- SpanDecorator for RPC call tracing
- 20+ named metrics covering all operations

**@helix-sdk/diagnostics**
- helix-diag CLI with 5 commands:
  - `check`: Single endpoint health verification
  - `pool`: Multi-endpoint pool testing with failover simulation
  - `tx`: Devnet transaction test with confirmation tracking
  - `jito`: Jito block engine diagnostics
  - `metrics`: Real-time metrics dump in JSON/table/Prometheus format
- Color-coded terminal output
- No external dependencies for basic operation

**apps/dashboard**
- Next.js 15 monitoring dashboard (dark mode)
- Real-time metrics WebSocket streaming
- RPC health sparkline charts
- Live transaction confirmation stream
- Pool status grid with per-endpoint metrics
- Alert panel for degraded endpoints
- Production-ready deployment to Vercel

**Documentation**
- Comprehensive README.md with badges and quick start
- Complete docs/ folder with Getting Started, API Reference, Architecture, Examples, and Troubleshooting guides


### Technical Foundation

- TypeScript 5.x with strict mode throughout
- web3.js v2.0 functional/modular API (no v1 classes)
- pnpm workspaces + Turborepo for monorepo management
- Vitest for fast test execution
- MSW for network request simulation
- GitHub Actions CI with 3 workflows
- 13/13 test suites passing
- 60+ individual tests
- 90%+ code coverage
- Zero lint warnings

---

[0.1.0]: https://github.com/KikiProjecto/helix-sdk/releases/tag/v0.1.0
