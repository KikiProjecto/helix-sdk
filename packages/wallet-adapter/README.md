# @helix-sdk/wallet-adapter

Solana Wallet Adapter plugin for the **Helix SDK** ecosystem. Transparently adds automatic priority fee injection, compute unit limit simulation, Jito MEV protection, and pool-balanced retry resilience to standard wallet operations under the functional `web3.js v2.0` standards.

## Installation

```bash
pnpm add @helix-sdk/wallet-adapter
# or
npm install @helix-sdk/wallet-adapter
```

## Quick Start

Wrap any standard Solana wallet adapter to automatically inject compute budgets and route transactions via Jito + RPC failover pool:

```typescript
import { HelixWalletAdapterPlugin } from '@helix-sdk/wallet-adapter';
import { createHelixClient } from '@helix-sdk/core';
import { FeeOracle } from '@helix-sdk/fees';
import { JitoClient } from '@helix-sdk/jito';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

// 1. Initialize Helix client and dependencies
const client = createHelixClient({
  endpoints: [
    { url: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY', priority: 1 },
    { url: 'https://api.mainnet-beta.solana.com', priority: 2 },
  ],
});

const feeOracle = new FeeOracle({
  minMicrolamportsPerCu: 1000,
  maxMicrolamportsPerCu: 1000000,
});

const jitoClient = new JitoClient({
  endpoint: 'mainnet',
  minTipLamports: 1000n,
});

// 2. Configure the plugin wrapper
const helixPlugin = new HelixWalletAdapterPlugin({
  client,
  fees: {
    enabled: true,
    feeOracle,
  },
  jito: {
    enabled: true,
    jitoClient,
  },
});

// 3. Wrap your standard wallet adapter
const phantomAdapter = new PhantomWalletAdapter();
const enhancedPhantom = helixPlugin.wrap(phantomAdapter);

// 4. Send transactions normally
// It now automatically:
// - Simulates compute units and injects SetComputeUnitLimit + Price instructions
// - appends Jito tip System transfer instructions
// - sends raw signed transactions to Jito block engines first
// - falls back to Helix RPC pool with retry and exponential backoff
const signature = await enhancedPhantom.sendTransaction(transaction, connection);
```

## Features

- **Transparent Middleware**: Intercepts `sendTransaction` calls on any standard adapter.
- **Dynamic Fee Injection**: Automatically simulates transactions at runtime and prepends optimal priority fee instructions.
- **Jito MEV Protection**: Automatically rotates tip accounts, injects tip transfers, and submits to regional Jito block engines before standard RPCs.
- **Failover & Retry**: Falls back to the standard Helix load-balanced RPC pool with backpressure queues.
