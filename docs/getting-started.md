# Getting Started with Helix SDK

## Installation

```bash
npm install @helix-sdk/core @helix-sdk/jito @helix-sdk/fees
# or
pnpm add @helix-sdk/core @helix-sdk/jito @helix-sdk/fees
```

## Quick Start

```typescript
import { createHelixClient } from '@helix-sdk/core';

// Create a resilient RPC client with automatic failover
const helix = createHelixClient({
  endpoints: [
    { url: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY', priority: 1 },
    { url: 'https://api.mainnet-beta.solana.com', priority: 2 },
  ],
  jito: { enabled: true },
  fees: { mode: 'dynamic' },
});

// Every RPC call is now resilient
const slot = await helix.getSlot('confirmed');
console.log(`Current slot: ${slot}`);

// Transaction sending with automatic confirmation and retry
const { value: { blockhash } } = await helix.getLatestBlockhash();
// ... build your transaction ...
const signature = await helix.sendAndConfirmTransaction(tx);
```

## What Just Happened?

1. ✅ RPC endpoint was selected from the pool based on health
2. ✅ Your transaction is routed through Jito (if available) for MEV protection
3. ✅ Priority fees are estimated dynamically
4. ✅ Metrics are emitted for observability
5. ✅ On failure, automatic retry happens against alternate endpoints

## Next Steps

- Read the **[API Reference](./api-reference.md)** for all available methods
- Check **[Examples](./examples.md)** for more advanced use cases
- See **[Architecture](./architecture.md)** to understand the design

## Need Help?

- Open an [Issue](https://github.com/KikiProjecto/helix-sdk/issues)
- Check [Troubleshooting](./troubleshooting.md)
