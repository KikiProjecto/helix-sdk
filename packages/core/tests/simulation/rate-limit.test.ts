import { describe, it, expect, beforeEach } from 'vitest';
import { createHelixClient, HelixRpcClient } from '../../src/client/HelixRpcClient.js';
import { setupMockFetch, MockEndpointState } from '../mockFetch.js';

describe('Rate Limit Simulation', () => {
  let endpoints: MockEndpointState[];
  let restoreFetch: () => void;

  beforeEach(() => {
    endpoints = [
      {
        url: 'https://rpc-rate-limited.solana.com',
        status: 429, // initialized as rate-limited
        latencyMs: 5,
        slotResponse: 300,
        callCount: 0,
      },
      {
        url: 'https://rpc-unlimited.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 300,
        callCount: 0,
      },
    ];
    restoreFetch = setupMockFetch(endpoints);
  });

  it('backs off and rotates to alternative node when encountering HTTP 429 rate limit', async () => {
    const client: HelixRpcClient = createHelixClient(
      {
        endpoints: [
          { url: 'https://rpc-rate-limited.solana.com', priority: 1 },
          { url: 'https://rpc-unlimited.solana.com', priority: 2 },
        ],
        healthCheckIntervalMs: 0,
      },
      {
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 50,
          backoffMultiplier: 1.5,
          jitterFactor: 0.1,
          retryableErrors: ['HTTP_429'],
        },
      }
    );

    const slot = await client.getSlot().send();
    expect(slot).toBe(300n);

    const limitedState = endpoints.find((e) => e.url === 'https://rpc-rate-limited.solana.com')!;
    const unlimitedState = endpoints.find((e) => e.url === 'https://rpc-unlimited.solana.com')!;

    expect(limitedState.callCount).toBe(1); // Tried and failed
    expect(unlimitedState.callCount).toBe(1); // Rotated to backup and succeeded

    await client.destroy();
    restoreFetch();
  });
});
