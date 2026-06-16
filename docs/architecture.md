# Architecture

## System Design

```
┌─────────────────────────────────────────────────────┐
│                  Your dApp / Protocol               │
├─────────────────────────────────────────────────────┤
│          @helix-sdk/wallet-adapter                  │
│    (transparent resilience middleware)              │
├─────────────────────────────────────────────────────┤
│  @helix-sdk/core    │    @helix-sdk/jito            │
│  (RPC pool)         │    (MEV routing)              │
├─────────────────────────────────────────────────────┤
│          @helix-sdk/fees                            │
│    (dynamic fee estimation)                         │
├─────────────────────────────────────────────────────┤
│        @helix-sdk/observability                     │
│    (OpenTelemetry + Datadog + Prometheus)           │
├─────────────────────────────────────────────────────┤
│        @helix-sdk/diagnostics (CLI)                 │
│    (troubleshooting tools)                          │
└─────────────────────────────────────────────────────┘
         ↓ (underlying)
    Solana web3.js v2.0
```

## Package Relationships

- **core** — depends on nothing, fundamental layer
- **jito** — depends on core
- **fees** — depends on core
- **wallet-adapter** — depends on core + fees
- **observability** — depends on nothing, cross-cuts all
- **diagnostics** — depends on all (CLI tool)

## Key Design Patterns

1. **RPC Pool** — Round-robin with health monitoring
2. **Fallback Chain** — Exponential backoff with jitter
3. **MEV Relay** — Jito integration with RPC fallback
4. **Metrics** — OpenTelemetry spans + OTel metrics + Datadog export
5. **Observable** — Every operation emits metrics and traces

---

