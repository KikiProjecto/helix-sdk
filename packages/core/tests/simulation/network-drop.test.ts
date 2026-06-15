import { describe, it, expect, beforeEach } from 'vitest';
import { createHelixClient, HelixRpcClient } from '../../src/client/HelixRpcClient.js';
import { setupMockFetch, MockEndpointState } from '../mockFetch.js';

describe('Network Drop Simulation', () => {
  let endpoints: MockEndpointState[];
  let restoreFetch: () => void;

  beforeEach(() => {
    endpoints = [
      {
        url: 'https://rpc-primary.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 888,
        callCount: 0,
      },
      {
        url: 'https://rpc-backup.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 888,
        callCount: 0,
      },
    ];
    restoreFetch = setupMockFetch(endpoints);
  });

  it('fails over immediately when primary endpoint returns 503 node unavailable', async () => {
    const client: HelixRpcClient = createHelixClient({
      endpoints: [
        { url: 'https://rpc-primary.solana.com', priority: 1 },
        { url: 'https://rpc-backup.solana.com', priority: 2 },
      ],
      healthCheckIntervalMs: 0,
    });

    // Make initial call, should use primary
    const slot1 = await client.getSlot().send();
    expect(slot1).toBe(888n);
    const primState = endpoints.find((e) => e.url === 'https://rpc-primary.solana.com')!;
    expect(primState.callCount).toBe(1);

    // Simulate primary network drop (503 Service Unavailable)
    primState.status = 503;

    // Second call: should automatically catch error on primary, flag degraded, failover to backup
    const slot2 = await client.getSlot().send();
    expect(slot2).toBe(888n);

    const backupState = endpoints.find((e) => e.url === 'https://rpc-backup.solana.com')!;
    expect(backupState.callCount).toBe(1);

    // Primary should be marked unhealthy now due to passive record errors
    const health = client.getHealthStatus();
    const primaryHealth = health.endpoints.find((e) => e.url === 'https://rpc-primary.solana.com');
    expect(primaryHealth?.status).toBe('unhealthy');

    await client.destroy();
    restoreFetch();
  });
});
