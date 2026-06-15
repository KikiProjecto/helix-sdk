import { Address } from '@solana/web3.js';
import { HelixRpcClient } from '@helix-sdk/core';

export type JitoEndpoint =
  | 'mainnet'
  | 'ny'
  | 'amsterdam'
  | 'frankfurt'
  | 'tokyo'
  | 'dallas';

export interface JitoClientConfig {
  endpoint?: JitoEndpoint;              // default: 'mainnet'
  allEndpoints?: boolean;               // try all regions in parallel
  minTipLamports?: bigint;              // default: 1_000n
  maxTipLamports?: bigint;              // default: 100_000n
  tipMode?: 'fixed' | 'dynamic';       // dynamic = from tip oracle, default: 'fixed'
  bundleTimeout?: number;               // default: 30_000ms
  rpcFallback?: HelixRpcClient;        // fall back to this on Jito failure
}

export interface JitoBundle {
  transactions: readonly string[];      // Base64 encoded wire transactions
  tipAccountAddress: Address;
  tipLamports: bigint;
}

export interface BundleResult {
  bundleId: string;
  status: 'accepted' | 'rejected' | 'timeout';
  slot?: number;
  error?: string;
}

export interface TipEstimate {
  time: string;
  landed_tips_25th_percentile: number;
  landed_tips_50th_percentile: number;
  landed_tips_75th_percentile: number;
  landed_tips_95th_percentile: number;
  landed_tips_99th_percentile: number;
}
