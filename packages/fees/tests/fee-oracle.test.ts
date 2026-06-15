import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FeeOracle } from '../src/FeeOracle.js';
import { HeliusFeeProvider } from '../src/providers/HeliusFeeProvider.js';
import { NativeFeeProvider } from '../src/providers/NativeFeeProvider.js';

const PROGRAM_IDS = ['11111111111111111111111111111111'];

describe('FeeOracle and Providers', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HeliusFeeProvider fetches successfully', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: { priorityFeeEstimate: 1250 },
        id: '1',
      }),
    } as any);

    const provider = new HeliusFeeProvider('https://helius.com/?api-key=test');
    const est = await provider.estimateFee(PROGRAM_IDS);
    expect(est.microlamportsPerCu).toBe(1250);
    expect(est.source).toBe('helius');
    expect(est.confidence).toBe('high');
  });

  it('HeliusFeeProvider fails gracefully on error status', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);

    const provider = new HeliusFeeProvider('test-key');
    await expect(provider.estimateFee(PROGRAM_IDS)).rejects.toThrow();
  });

  it('NativeFeeProvider calculates median fee correctly', async () => {
    const mockRpc = {
      getRecentPrioritizationFees: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue([
          { prioritizationFee: 1000n },
          { prioritizationFee: 5000n },
          { prioritizationFee: 3000n },
        ]),
      }),
    };

    const provider = new NativeFeeProvider(mockRpc);
    const est = await provider.estimateFee(PROGRAM_IDS);
    // Sorted fees: 1000, 3000, 5000. Median is 3000.
    expect(est.microlamportsPerCu).toBe(3000);
    expect(est.source).toBe('native');
  });

  it('FeeOracle cascade fallback mode works correctly', async () => {
    const p1 = {
      name: 'provider1',
      estimateFee: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const p2 = {
      name: 'provider2',
      estimateFee: vi.fn().mockResolvedValue({
        microlamportsPerCu: 4500,
        estimatedLamportsCost: 900n,
        source: 'p2',
        confidence: 'medium',
      }),
    };

    const oracle = new FeeOracle({
      providers: [p1, p2],
      fallbackMode: 'cascade',
      minMicrolamportsPerCu: 1000,
      maxMicrolamportsPerCu: 10000,
    });

    const est = await oracle.estimateFee(PROGRAM_IDS);
    expect(est.microlamportsPerCu).toBe(4500);
    expect(p1.estimateFee).toHaveBeenCalledTimes(1);
    expect(p2.estimateFee).toHaveBeenCalledTimes(1);
  });

  it('FeeOracle median fallback mode calculates median of successful providers', async () => {
    const p1 = {
      name: 'p1',
      estimateFee: vi.fn().mockResolvedValue({
        microlamportsPerCu: 2000,
        source: 'p1',
        confidence: 'medium',
      }),
    };
    const p2 = {
      name: 'p2',
      estimateFee: vi.fn().mockResolvedValue({
        microlamportsPerCu: 4000,
        source: 'p2',
        confidence: 'medium',
      }),
    };
    const p3 = {
      name: 'p3',
      estimateFee: vi.fn().mockRejectedValue(new Error('error')),
    };

    const oracle = new FeeOracle({
      providers: [p1, p2, p3],
      fallbackMode: 'median',
    });

    const est = await oracle.estimateFee(PROGRAM_IDS);
    // Median of p1 (2000) and p2 (4000) is (2000 + 4000) / 2 = 3000
    expect(est.microlamportsPerCu).toBe(3000);
    expect(p1.estimateFee).toHaveBeenCalledTimes(1);
    expect(p2.estimateFee).toHaveBeenCalledTimes(1);
    expect(p3.estimateFee).toHaveBeenCalledTimes(1);
  });

  it('FeeOracle applies caching and TTL', async () => {
    const p1 = {
      name: 'p1',
      estimateFee: vi.fn().mockResolvedValue({
        microlamportsPerCu: 2500,
        source: 'p1',
        confidence: 'medium',
      }),
    };

    const oracle = new FeeOracle({
      providers: [p1],
      cacheTtlMs: 200,
    });

    const est1 = await oracle.estimateFee(PROGRAM_IDS);
    expect(est1.microlamportsPerCu).toBe(2500);
    expect(p1.estimateFee).toHaveBeenCalledTimes(1);

    // Immediate second call should hit cache
    const est2 = await oracle.estimateFee(PROGRAM_IDS);
    expect(est2.microlamportsPerCu).toBe(2500);
    expect(p1.estimateFee).toHaveBeenCalledTimes(1);

    // Wait for cache expiry
    await new Promise((r) => setTimeout(r, 250));

    const est3 = await oracle.estimateFee(PROGRAM_IDS);
    expect(est3.microlamportsPerCu).toBe(2500);
    expect(p1.estimateFee).toHaveBeenCalledTimes(2);
  });

  it('FeeOracle clamps estimates to limits', async () => {
    const p1 = {
      name: 'p1',
      estimateFee: vi.fn().mockResolvedValue({
        microlamportsPerCu: 500, // below min
        source: 'p1',
        confidence: 'medium',
      }),
    };

    const oracle = new FeeOracle({
      providers: [p1],
      minMicrolamportsPerCu: 1500,
    });

    const est = await oracle.estimateFee(PROGRAM_IDS);
    expect(est.microlamportsPerCu).toBe(1500); // Clamped to min
  });

  it('falls back to static fallback if no providers configured', async () => {
    const oracle = new FeeOracle({ providers: [] });
    const est = await oracle.estimateFee(PROGRAM_IDS);
    expect(est.microlamportsPerCu).toBe(5000); // default floor
    expect(est.source).toBe('static_fallback');
  });

  it('throws error if all providers in cascade fail', async () => {
    const p1 = { name: 'p1', estimateFee: vi.fn().mockRejectedValue(new Error('p1 failed')) };
    const oracle = new FeeOracle({ providers: [p1] });
    await expect(oracle.estimateFee(PROGRAM_IDS)).rejects.toThrow('All fee providers in cascade failed');
  });

  it('throws error if all providers in median fail', async () => {
    const p1 = { name: 'p1', estimateFee: vi.fn().mockRejectedValue(new Error('p1 failed')) };
    const oracle = new FeeOracle({ providers: [p1], fallbackMode: 'median' });
    await expect(oracle.estimateFee(PROGRAM_IDS)).rejects.toThrow('All fee providers in median mode failed');
  });
});
