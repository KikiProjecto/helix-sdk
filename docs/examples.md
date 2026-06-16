# Examples

## Basic Usage

```typescript
import { createHelixClient } from '@helix-sdk/core';

const helix = createHelixClient({
  endpoints: [
    { url: 'https://api.devnet.solana.com', priority: 1 },
  ],
});

const slot = await helix.getSlot();
console.log(`Current slot: ${slot}`);
```

## With MEV Protection

```typescript
const helix = createHelixClient({
  endpoints: [
    { url: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY', priority: 1 },
    { url: 'https://api.mainnet-beta.solana.com', priority: 2 },
  ],
  jito: { enabled: true, minTipLamports: 5000n },
});

// Transactions are automatically routed through Jito
```

## With Wallet Adapter

```typescript
import { HelixWalletAdapterPlugin } from '@helix-sdk/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

const helix = new HelixWalletAdapterPlugin({ client: helixClient });
const phantom = helix.wrap(new PhantomWalletAdapter());

// Now phantom.sendTransaction() includes:
// - Compute budget estimation
// - Jito MEV protection
// - Automatic retry on failure
```

## With Observability

```typescript
const helix = createHelixClient({
  endpoints: [...],
  observability: {
    otel: { enabled: true, endpoint: 'http://localhost:4318' },
    datadog: { enabled: true, apiKey: process.env.DD_API_KEY },
  },
});

// All operations now emit OpenTelemetry metrics and traces
```

## Health Monitoring

```typescript
const health = helix.getHealthStatus();

for (const endpoint of health.endpoints) {
  console.log(`${endpoint.url}:`);
  console.log("  Status: " + endpoint.status);
  console.log("  P50: " + endpoint.latencyP50Ms + "ms");
  console.log("  P99: " + endpoint.latencyP99Ms + "ms");
}
```
