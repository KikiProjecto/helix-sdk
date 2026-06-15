import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { address } from '@solana/web3.js';
import { JitoClient } from '../src/JitoClient.js';

describe('JitoClient', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches tip accounts from Jito Block Engine RPC', async () => {
    const mockAccounts = [
      '96gYZGLnJYVFihjz7UkAH556C6nwyGPK6F5iY4HLY3bS',
      'HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83',
    ];

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: mockAccounts,
        id: 1,
      }),
    } as any);

    const client = new JitoClient();
    const accounts = await client.getTipAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0]!.toString()).toBe(mockAccounts[0]);
  });

  it('falls back to default tip accounts on query error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('RPC node unavailable'));

    const client = new JitoClient();
    const accounts = await client.getTipAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]!.toString()).toBe('96gYZGLnJYVFihjz7UkAH556C6nwyGPK6F5iY4HLY3bS');
  });

  it('returns correct tip amount for fixed mode', async () => {
    const client = new JitoClient({
      tipMode: 'fixed',
      minTipLamports: 1500n,
    });

    const tip = await client.getTipAmount();
    expect(tip).toBe(1500n);
  });

  it('returns correct tip amount for dynamic mode with clamping', async () => {
    const client = new JitoClient({
      tipMode: 'dynamic',
      minTipLamports: 2000n,
      maxTipLamports: 10000n,
    });

    // Mock TipOracle fetch inside JitoClient
    vi.spyOn(client.tipOracle, 'getRecommendedTip').mockResolvedValue(5000n);
    let tip = await client.getTipAmount();
    expect(tip).toBe(5000n);

    // Mock clamping below min
    vi.spyOn(client.tipOracle, 'getRecommendedTip').mockResolvedValue(1000n);
    tip = await client.getTipAmount();
    expect(tip).toBe(2000n);

    // Mock clamping above max
    vi.spyOn(client.tipOracle, 'getRecommendedTip').mockResolvedValue(50000n);
    tip = await client.getTipAmount();
    expect(tip).toBe(10000n);
  });

  it('creates a valid System transfer tip instruction object', async () => {
    const client = new JitoClient({
      minTipLamports: 5000n,
    });

    const feePayer = address('HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83');
    const { instruction, tipAccount, tipLamports } = await client.createTipInstruction(feePayer);

    expect(instruction.programAddress.toString()).toBe('11111111111111111111111111111111');
    expect(instruction.accounts).toHaveLength(2);
    expect(instruction.accounts![0]!.address).toBe(feePayer);
    expect(instruction.accounts![1]!.address).toBe(tipAccount);
    expect(tipLamports).toBe(5000n);
  });

  it('sends bundle and tracks it to acceptance', async () => {
    // 1st fetch: sendBundle JSON-RPC request
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: 'bundle-uuid-123',
        id: 1,
      }),
    } as any);

    // 2nd fetch: getBundleStatuses checking status
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: {
          value: [
            {
              bundle_id: 'bundle-uuid-123',
              confirmation_status: 'confirmed',
              slot: 45678,
              err: null,
            },
          ],
        },
        id: 1,
      }),
    } as any);

    const client = new JitoClient({
      bundleTimeout: 1000,
    });

    const res = await client.sendBundle({
      transactions: [Buffer.from('dummy_tx_bytes').toString('base64')],
      tipAccountAddress: address('HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83'),
      tipLamports: 1000n,
    });

    expect(res.status).toBe('accepted');
    expect(res.bundleId).toBe('bundle-uuid-123');
    expect(res.slot).toBe(45678);
  });

  it('handles bundle rejection on chain', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: 'bundle-uuid-123',
        id: 1,
      }),
    } as any);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: {
          value: [
            {
              bundle_id: 'bundle-uuid-123',
              confirmation_status: 'processed',
              slot: 45678,
              err: { InstructionError: [0, 'CustomError'] },
            },
          ],
        },
        id: 1,
      }),
    } as any);

    const client = new JitoClient({ bundleTimeout: 1000 });
    const res = await client.sendBundle({
      transactions: [Buffer.from('dummy_tx_bytes').toString('base64')],
      tipAccountAddress: address('HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83'),
      tipLamports: 1000n,
    });

    expect(res.status).toBe('rejected');
    expect(res.error).toContain('InstructionError');
  });

  it('submits in parallel when allEndpoints is true', async () => {
    // We expect 6 fetch calls in parallel for sendBundle submission (one for each regional endpoint)
    // Mock successful response for the first region, and others can succeed/fail.
    // To mock Promise.any correctly:
    for (let i = 0; i < 6; i++) {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: `bundle-uuid-${i}`,
          id: 1,
        }),
      } as any);
    }

    // Tracker fetch status
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: {
          value: [
            {
              bundle_id: 'bundle-uuid-0',
              confirmation_status: 'finalized',
              slot: 99999,
              err: null,
            },
          ],
        },
        id: 1,
      }),
    } as any);

    const client = new JitoClient({
      allEndpoints: true,
      bundleTimeout: 1000,
    });

    const res = await client.sendBundle({
      transactions: [Buffer.from('dummy_tx').toString('base64')],
      tipAccountAddress: address('HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83'),
      tipLamports: 1000n,
    });

    expect(res.status).toBe('accepted');
    expect(res.slot).toBe(99999);
  });
});
