import { describe, it, expect, beforeEach } from 'vitest';
import { createHelixClient, HelixRpcClient } from '../src/client/HelixRpcClient.js';
import { setupMockFetch, MockEndpointState } from './mockFetch.js';

describe('HelixRpcClient Proxy & Caching', () => {
  let endpoints: MockEndpointState[];
  let restoreFetch: () => void;

  beforeEach(() => {
    endpoints = [
      {
        url: 'https://rpc1.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 200,
        blockhashResponse: {
          blockhash: '99999999999999999999999999999999',
          lastValidBlockHeight: 1200,
        },
        callCount: 0,
      },
    ];
    restoreFetch = setupMockFetch(endpoints);
  });

  it('routes standard RPC calls like getSlot through fallback pool', async () => {
    const client: HelixRpcClient = createHelixClient({
      endpoints: [{ url: 'https://rpc1.solana.com' }],
    });

    const slot = await client.getSlot().send();
    expect(slot).toBe(200n);

    const metrics = client.getMetrics();
    expect(metrics.healthyNodes).toBe(1);
    expect(metrics.totalRequests).toBeGreaterThan(0);

    await client.destroy();
    restoreFetch();
  });

  it('uses BlockhashCache for getLatestBlockhash and records hit/miss metrics', async () => {
    const client: HelixRpcClient = createHelixClient({
      endpoints: [{ url: 'https://rpc1.solana.com' }],
    });

    // 1st call: Miss, fetches from RPC
    const res1 = await client.getLatestBlockhash().send();
    expect(res1.value.blockhash).toBe('99999999999999999999999999999999');

    // 2nd call: Hit, served from cache
    const res2 = await client.getLatestBlockhash().send();
    expect(res2.value.blockhash).toBe('99999999999999999999999999999999');

    const cacheMetrics = client.blockhashCache.getMetrics();
    expect(cacheMetrics.cacheMisses).toBe(1);
    expect(cacheMetrics.cacheHits).toBe(1);

    await client.destroy();
    restoreFetch();
  });
});
