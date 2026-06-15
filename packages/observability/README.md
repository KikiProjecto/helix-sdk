# @helix-sdk/observability

OpenTelemetry-native observability pipeline for the **Helix SDK** ecosystem. Provides automatic JSON-RPC span decorators, custom Prometheus scrape exporters, Datadog push metrics bridges, and manual instrumentation emitters.

## Installation

```bash
pnpm add @helix-sdk/observability
# or
npm install @helix-sdk/observability
```

## Quick Start

Enable OpenTelemetry tracing and Prometheus exporter scraping in your dApp server or background worker:

```typescript
import { 
  HelixMeterProvider, 
  HelixTracerProvider, 
  PrometheusExporter,
  SpanDecorator 
} from '@helix-sdk/observability';
import { createHelixClient } from '@helix-sdk/core';

// 1. Start OpenTelemetry Meter and Tracer Providers
const meterProvider = new HelixMeterProvider({
  serviceName: 'my-solana-dapp',
  datadog: {
    enabled: true,
    apiKey: process.env.DD_API_KEY!,
    env: 'production',
  },
});
meterProvider.start();

const tracerProvider = new HelixTracerProvider({
  serviceName: 'my-solana-dapp',
});
tracerProvider.start();

// 2. Start Prometheus exporter server on port 9090
const prometheus = new PrometheusExporter({ port: 9090 });
prometheus.start();

// 3. Decorate your HelixRpcClient
const client = createHelixClient({
  endpoints: [{ url: 'https://api.mainnet-beta.solana.com' }],
});
const observedClient = SpanDecorator.decorate(client);

// Now all calls to observedClient (like getSlot, sendTransaction) automatically emit
// OTel spans, requests counters, error rates, and latency histograms.
await observedClient.getSlot().send();
```

## Metrics Collected

| Metric Name | Type | Description |
|---|---|---|
| `helix.rpc.latency_ms` | Histogram | Per-endpoint per-method latency |
| `helix.rpc.requests_total` | Counter | Total RPC calls |
| `helix.rpc.errors_total` | Counter | Errors by code |
| `helix.tx.sent_total` | Counter | Total transactions sent |
| `helix.tx.confirmed_total` | Counter | Confirmed by commitment level |
| `helix.tx.dropped_total` | Counter | Dropped transactions + reason |
| `helix.pool.failover_total` | Counter | Pool failover events |

## Features

- **OTel Native**: Integrates directly with global OTel registry.
- **SpanDecorator**: Proxy-based interceptor that wraps any Web3.js v2 method in a span with attributes.
- **Datadog Push Exporter**: Automatically maps OTel metrics to Datadog's API payload format and posts them.
- **Prometheus Scraper**: Spawns a lightweight HTTP server on port 9090 to expose a `/metrics` scrape target.
