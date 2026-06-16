# API Reference

## @helix-sdk/core

### createHelixClient(config)

Main entry point. Creates a resilient Solana RPC client with failover support.

```typescript
interface HelixClientConfig {
  endpoints: EndpointConfig[];
  healthCheckIntervalMs?: number;
  degradedLatencyThresholdMs?: number;
  jito?: JitoConfig;
  fees?: FeeOracleConfig;
  observability?: ObservabilityConfig;
  logger?: HelixLogger;
}

const helix = createHelixClient({
  endpoints: [
    { url: 'https://...', priority: 1, weight: 1.0 },
  ],
});
```

### Methods

All standard Solana RPC methods are available:

```typescript
helix.getSlot(commitment?)
helix.getLatestBlockhash(commitment?)
helix.getBalance(address, commitment?)
helix.sendTransaction(tx, options?)
helix.sendAndConfirmTransaction(tx, options?)
helix.simulateTransaction(tx)
helix.getSignatureStatuses(signatures)
helix.getRecentPrioritizationFees(programIds?)
```

## @helix-sdk/jito

### Jito Integration

Enable Jito MEV protection:

```typescript
const helix = createHelixClient({
  jito: {
    enabled: true,
    endpoint: 'mainnet',  // 'ny', 'frankfurt', 'amsterdam', 'tokyo', 'dallas'
    minTipLamports: 1000n,
    maxTipLamports: 100_000n,
  },
});
```

## @helix-sdk/fees

### Dynamic Fee Estimation

Enable dynamic fee mode:

```typescript
const helix = createHelixClient({
  fees: {
    mode: 'dynamic',
    maxMicrolamportsPerCu: 1_000_000,
  },
});
```

## @helix-sdk/wallet-adapter

### Phantom Integration

```typescript
import { HelixWalletAdapterPlugin } from '@helix-sdk/wallet-adapter';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

const helix = new HelixWalletAdapterPlugin({ client: helixClient });
const enhancedPhantom = helix.wrap(new PhantomWalletAdapter());

// Use enhancedPhantom like any other wallet adapter — now with resilience
```

## @helix-sdk/observability

### OpenTelemetry Export

```typescript
const helix = createHelixClient({
  observability: {
    otel: {
      enabled: true,
      endpoint: 'http://localhost:4318',
    },
    datadog: {
      enabled: true,
      apiKey: process.env.DD_API_KEY,
    },
  },
});
```

## @helix-sdk/diagnostics

### CLI Commands

```bash
helix-diag check <endpoint-url>
helix-diag pool <endpoint1> [endpoint2] [endpoint3]
helix-diag tx --rpc <url> --keypair <path> --network devnet
helix-diag jito --endpoint mainnet
helix-diag metrics --format json|table|prometheus
```

---

For more details, see the README.md in each package directory.
