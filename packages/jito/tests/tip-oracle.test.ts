import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TipOracle } from '../src/TipOracle.js';

describe('TipOracle', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches successfully from Jito Tips API returning array', async () => {
    const mockTips = [
      {
        time: '2026-06-15T00:00:00Z',
        landed_tips_25th_percentile: 0.00001,
        landed_tips_50th_percentile: 0.00005,
        landed_tips_75th_percentile: 0.0001,
        landed_tips_95th_percentile: 0.0005,
        landed_tips_99th_percentile: 0.001,
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => mockTips,
    } as any);

    const oracle = new TipOracle({ cacheTtlMs: 5000 });

    const p50 = await oracle.getRecommendedTip('p50');
    expect(p50).toBe(50000n); // 0.00005 SOL = 50,000 lamports
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Call again, should use cache (no second fetch)
    const p75 = await oracle.getRecommendedTip('p75');
    expect(p75).toBe(100000n); // 0.0001 SOL = 100,000 lamports
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Clear cache, should fetch again
    oracle.clear();
    const p95 = await oracle.getRecommendedTip('p95');
    expect(p95).toBe(500000n);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('handles object formatted response', async () => {
    const mockTips = {
      time: '2026-06-15T00:00:00Z',
      landed_tips_25th_percentile: 0.00002,
      landed_tips_50th_percentile: 0.00004,
      landed_tips_75th_percentile: 0.00008,
      landed_tips_95th_percentile: 0.00016,
      landed_tips_99th_percentile: 0.00032,
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTips,
    } as any);

    const oracle = new TipOracle();
    const p25 = await oracle.getRecommendedTip('p25');
    expect(p25).toBe(20000n);
  });

  it('falls back to configured defaults on API failure', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    const oracle = new TipOracle({
      fallbackP50: 12345n,
    });

    const tip = await oracle.getRecommendedTip('p50');
    expect(tip).toBe(12345n);
  });

  it('falls back on invalid/non-numeric values', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        landed_tips_50th_percentile: 'invalid_string',
      }),
    } as any);

    const oracle = new TipOracle({
      fallbackP50: 9999n,
    });

    const tip = await oracle.getRecommendedTip('p50');
    expect(tip).toBe(9999n);
  });

  it('respects abort signal', async () => {
    const oracle = new TipOracle();
    const controller = new AbortController();
    controller.abort();

    await expect(oracle.getRecommendedTip('p50', controller.signal)).rejects.toThrow();
  });
});
