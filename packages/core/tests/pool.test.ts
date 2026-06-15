import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EndpointHealthMonitor } from '../src/pool/EndpointHealthMonitor.js';
import { FallbackChain } from '../src/pool/FallbackChain.js';
import { setupMockFetch, MockEndpointState } from './mockFetch.js';

describe('EndpointHealthMonitor & FallbackChain', () => {
  let endpoints: MockEndpointState[];
  let restoreFetch: () => void;

  beforeEach(() => {
    endpoints = [
      {
        url: 'https://rpc1.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 100,
        callCount: 0,
      },
      {
        url: 'https://rpc2.solana.com',
        status: 200,
        latencyMs: 5,
        slotResponse: 100,
        callCount: 0,
      },
      {
        url: 'https://rpc3.solana.com',
        status: 200,
        latencyMs: 500, // will be marked degraded (> 200ms threshold)
        slotResponse: 100,
        callCount: 0,
      },
    ];
    restoreFetch = setupMockFetch(endpoints);
  });

  it('correctly tracks health and transitions statuses based on latency and errors', async () => {
    vi.useFakeTimers();

    const monitor = new EndpointHealthMonitor({
      endpoints: [
        { url: 'https://rpc1.solana.com', weight: 1 },
        { url: 'https://rpc2.solana.com', weight: 2 },
        { url: 'https://rpc3.solana.com', weight: 1 },
      ],
      healthCheckIntervalMs: 100,
      degradedLatencyThresholdMs: 200,
      healthCheckTimeoutMs: 600,
    });

    monitor.start();
    // Advance timers by 650ms to let the background loops trigger and complete
    await vi.advanceTimersByTimeAsync(650);
    monitor.stop();

    const h1 = monitor.getHealth('https://rpc1.solana.com');
    const h2 = monitor.getHealth('https://rpc2.solana.com');
    const h3 = monitor.getHealth('https://rpc3.solana.com');

    expect(h1?.status).toBe('healthy');
    expect(h2?.status).toBe('healthy');
    expect(h3?.status).toBe('degraded');

    // Simulate 3 errors for rpc1
    monitor.recordRequest('https://rpc1.solana.com', 5, false);
    monitor.recordRequest('https://rpc1.solana.com', 5, false);
    monitor.recordRequest('https://rpc1.solana.com', 5, false);

    const h1AfterErrors = monitor.getHealth('https://rpc1.solana.com');
    expect(h1AfterErrors?.status).toBe('unhealthy');

    restoreFetch();
    vi.useRealTimers();
  });

  it('FallbackChain successfully selects endpoints based on scoring and recovers', async () => {
    const monitor = new EndpointHealthMonitor({
      endpoints: [
        { url: 'https://rpc1.solana.com', weight: 1 },
        { url: 'https://rpc2.solana.com', weight: 10 }, // heavy weight
      ],
      healthCheckIntervalMs: 1000,
    });

    // Record success to initialize
    monitor.recordRequest('https://rpc1.solana.com', 10, true);
    monitor.recordRequest('https://rpc2.solana.com', 10, true);

    const fallbackChain = new FallbackChain(
      [
        { url: 'https://rpc1.solana.com', weight: 1 },
        { url: 'https://rpc2.solana.com', weight: 10 },
      ],
      monitor,
      {
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 5,
          maxDelayMs: 20,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
          retryableErrors: ['HTTP_429'],
        },
      }
    );

    // Try a simple operation
    const result = await fallbackChain.execute(async (url) => {
      return `success_from_${url}`;
    });

    // Given weight 10, rpc2 should be preferred or executed successfully
    expect(result).toMatch(/success_from_https:\/\/rpc/);

    // Simulate rpc2 rate limit (HTTP 429)
    const state2 = endpoints.find((e) => e.url === 'https://rpc2.solana.com')!;
    state2.status = 429;

    // Execute again: it should fallback to rpc1 after trying rpc2
    const resultAfterFailure = await fallbackChain.execute(async (url, options) => {
      if (url === 'https://rpc2.solana.com') {
        throw new Error('HTTP_429: Too Many Requests');
      }
      return `fallback_to_${url}`;
    });

    expect(resultAfterFailure).toBe('fallback_to_https://rpc1.solana.com');

    restoreFetch();
  });
});
