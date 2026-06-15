import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Address, Signature } from '@solana/web3.js';

vi.mock('@solana/web3.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...original,
    getSignatureFromTransaction: (tx: any) => tx?.signature ?? ('mock_sig_123' as unknown as Signature),
    getBase64EncodedWireTransaction: () => 'mock_wire_bytes',
  };
});

import { encodeBase58 } from '../src/base58.js';
import { TipOracle } from '../src/TipOracle.js';
import { BundleTracker } from '../src/BundleTracker.js';
import { JitoClient } from '../src/JitoClient.js';
import { JitoFallbackSender } from '../src/JitoFallbackSender.js';

describe('Jito Coverage Expansion', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('covers base58 leading zeros', () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 3]);
    const encoded = encodeBase58(bytes);
    expect(encoded.startsWith('11')).toBe(true);

    const empty = encodeBase58(new Uint8Array(0));
    expect(empty).toBe('');
  });

  it('covers TipOracle fallback branches and fetch errors', async () => {
    // 1. HTTP error branch
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as any);

    const oracle = new TipOracle();
    const result = await oracle.fetchTips();
    expect(result).toBeNull();

    // 2. JSON RPC / null estimate branch
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    } as any);
    const resultNull = await oracle.fetchTips();
    expect(resultNull).toBeNull();

    // 3. Fallbacks for p25, p75, p99
    const oracle2 = new TipOracle({
      fallbackP25: 111n,
      fallbackP75: 222n,
      fallbackP99: 333n,
    });
    // Force fetch failure to trigger fallbacks
    fetchSpy.mockRejectedValue(new Error('Network failure'));
    
    expect(await oracle2.getRecommendedTip('p25')).toBe(111n);
    expect(await oracle2.getRecommendedTip('p75')).toBe(222n);
    expect(await oracle2.getRecommendedTip('p99')).toBe(333n);
  });

  it('covers BundleTracker HTTP error and Jito RPC error', async () => {
    const tracker = new BundleTracker({
      endpointUrl: 'https://rpc-engine.com',
      timeoutMs: 100,
    });

    // 1. HTTP error
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);
    
    // Tracking will poll, fetch returns 500, it catches it and loops.
    // Let's abort it immediately to stop loop
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await expect(tracker.track('bundle-123', controller.signal)).rejects.toThrow();

    // 2. Jito RPC error response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: -32600, message: 'Invalid request' } }),
    } as any);
    
    const controller2 = new AbortController();
    setTimeout(() => controller2.abort(), 10);
    await expect(tracker.track('bundle-123', controller2.signal)).rejects.toThrow();
  });

  it('covers JitoClient sendBundle submit errors', async () => {
    const client = new JitoClient();

    // 1. HTTP error in submit
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    } as any);

    const res1 = await client.sendBundle({
      transactions: ['tx1'],
      tipAccountAddress: 'addr' as any,
      tipLamports: 100n,
    });
    expect(res1.status).toBe('rejected');
    expect(res1.error).toContain('HTTP error 400');

    // 2. JSON RPC error in submit
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { message: 'Transaction too large' } }),
    } as any);

    const res2 = await client.sendBundle({
      transactions: ['tx1'],
      tipAccountAddress: 'addr' as any,
      tipLamports: 100n,
    });
    expect(res2.status).toBe('rejected');
    expect(res2.error).toContain('Transaction too large');

    // 3. Missing result in submit
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null }),
    } as any);

    const res3 = await client.sendBundle({
      transactions: ['tx1'],
      tipAccountAddress: 'addr' as any,
      tipLamports: 100n,
    });
    expect(res3.status).toBe('rejected');
    expect(res3.error).toContain('No bundleId returned');
  });

  it('covers JitoFallbackSender abort during fallback execution', async () => {
    const mockJito = new JitoClient();
    vi.spyOn(mockJito, 'createTipInstruction').mockResolvedValue({
      instruction: {} as any,
      tipAccount: 'acc' as any,
      tipLamports: 100n,
    });
    vi.spyOn(mockJito, 'sendBundle').mockResolvedValue({
      bundleId: 'bundle-123',
      status: 'timeout',
    });

    const mockRpc = {
      sendAndConfirmTransaction: vi.fn(),
    };

    const sender = new JitoFallbackSender(mockJito, mockRpc as any);
    const signCallback = vi.fn().mockResolvedValue({ signature: 'sig' });

    // Abort signal is aborted
    const controller = new AbortController();
    controller.abort(new Error('Signal cancelled by user'));

    await expect(
      sender.sendAndConfirm(
        { instructions: [] },
        signCallback,
        'feePayer' as any,
        { abortSignal: controller.signal }
      )
    ).rejects.toThrow('Signal cancelled by user');

    expect(mockRpc.sendAndConfirmTransaction).not.toHaveBeenCalled();
  });
});
