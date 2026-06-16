import { describe, it, expect, beforeEach } from 'vitest';
import { createHelixClient, HelixRpcClient } from '../../src/client/HelixRpcClient.js';
import { setupMockFetch, MockEndpointState } from '../mockFetch.js';

describe('Latency Spike Simulation', () => {
  let endpoints: MockEndpointState[];
  let restoreFetch: () => void;

  beforeEach(() => {
    endpoints = [
      {
        url: 'https://rpc-fast.solana.com',
        status: 200,
        latencyMs: 0,
        slotResponse: 500,
        callCount: 0,
      },
      {
        url: 'https://rpc-slow.solana.com',
        status: 200,
        latencyMs: 500, // higher than degraded threshold of 200ms
        slotResponse: 500,
        callCount: 0,
      },
    ];
    restoreFetch = setupMockFetch(endpoints);
  });

  it('marks node degraded and shifts traffic away from slow node', async () => {
    const client: HelixRpcClient = createHelixClient({
      endpoints: [
        { url: 'https://rpc-fast.solana.com', weight: 1 },
        { url: 'https://rpc-slow.solana.com', weight: 1 },
      ],
      healthCheckIntervalMs: 50,
      degradedLatencyThresholdMs: 200,
      healthCheckTimeoutMs: 600,
    });

    // Run active health checks to register latency
    await new Promise((resolve) => setTimeout(resolve, 650));

    const health = client.getHealthStatus();
    const fastHealth = health.endpoints.find((e) => e.url === 'https://rpc-fast.solana.com');
    const slowHealth = health.endpoints.find((e) => e.url === 'https://rpc-slow.solana.com');

    expect(fastHealth?.status).toBe('healthy');
    expect(slowHealth?.status).toBe('degraded');

    // Make multiple queries. Due to the degraded score multiplier (0.3), fast node should receive most requests.
    const fastState = endpoints.find((e) => e.url === 'https://rpc-fast.solana.com')!;
    const slowState = endpoints.find((e) => e.url === 'https://rpc-slow.solana.com')!;

    // Reset call counters from health check pings
    fastState.callCount = 0;
    slowState.callCount = 0;

    for (let i = 0; i < 20; i++) {
      await client.getSlot().send();
    }

    // Fast state calls should be significantly higher than slow state calls
    expect(fastState.callCount).toBeGreaterThan(slowState.callCount);

    await client.destroy();
    restoreFetch();
  });
});
