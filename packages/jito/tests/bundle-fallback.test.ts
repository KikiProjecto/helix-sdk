import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Address, Signature } from '@solana/web3.js';

// Mock Web3.js serialization helpers to safely handle dummy transaction objects
vi.mock('@solana/web3.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...original,
    getSignatureFromTransaction: (tx: any) => tx?.signature ?? ('mock_sig_123' as unknown as Signature),
    getBase64EncodedWireTransaction: () => 'mock_wire_bytes',
  };
});

import { JitoClient } from '../src/JitoClient.js';
import { JitoFallbackSender } from '../src/JitoFallbackSender.js';

describe('JitoFallbackSender', () => {
  let jitoClient: JitoClient;
  let mockRpcClient: any;
  let signCallback: any;
  const feePayer = 'HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83' as unknown as Address;

  beforeEach(() => {
    jitoClient = new JitoClient();
    mockRpcClient = {
      sendAndConfirmTransaction: vi.fn().mockResolvedValue('rpc_fallback_sig' as unknown as Signature),
    };
    signCallback = vi.fn().mockImplementation(async (txMsg) => {
      // Return a dummy signed transaction object
      return {
        message: txMsg,
        signature: 'signed_tx_sig' as unknown as Signature,
      };
    });
  });

  it('routes transaction successfully via Jito when bundle is accepted', async () => {
    vi.spyOn(jitoClient, 'createTipInstruction').mockResolvedValue({
      instruction: { programAddress: 'sys' as any, accounts: [], data: new Uint8Array() },
      tipAccount: 'tip_acc' as unknown as Address,
      tipLamports: 1000n,
    });

    vi.spyOn(jitoClient, 'sendBundle').mockResolvedValue({
      bundleId: 'bundle-123',
      status: 'accepted',
      slot: 100,
    });

    const sender = new JitoFallbackSender(jitoClient, mockRpcClient);

    const sig = await sender.sendAndConfirm(
      { instructions: [] },
      signCallback,
      feePayer
    );

    expect(sig.toString()).toBe('signed_tx_sig');
    expect(jitoClient.sendBundle).toHaveBeenCalledTimes(1);
    expect(mockRpcClient.sendAndConfirmTransaction).not.toHaveBeenCalled();
  });

  it('falls back to standard RPC client when Jito bundle is rejected/timeout', async () => {
    vi.spyOn(jitoClient, 'createTipInstruction').mockResolvedValue({
      instruction: { programAddress: 'sys' as any, accounts: [], data: new Uint8Array() },
      tipAccount: 'tip_acc' as unknown as Address,
      tipLamports: 1000n,
    });

    vi.spyOn(jitoClient, 'sendBundle').mockResolvedValue({
      bundleId: 'bundle-123',
      status: 'timeout',
      error: 'Bundle timed out',
    });

    const sender = new JitoFallbackSender(jitoClient, mockRpcClient);

    const sig = await sender.sendAndConfirm(
      { instructions: [] },
      signCallback,
      feePayer
    );

    expect(sig.toString()).toBe('rpc_fallback_sig');
    expect(jitoClient.sendBundle).toHaveBeenCalledTimes(1);
    // Verified that it called standard RPC client fallback
    expect(mockRpcClient.sendAndConfirmTransaction).toHaveBeenCalledTimes(1);
  });

  it('falls back immediately if Jito client throw error during construct/send', async () => {
    vi.spyOn(jitoClient, 'createTipInstruction').mockRejectedValue(new Error('RPC failure on tip accounts'));

    const sender = new JitoFallbackSender(jitoClient, mockRpcClient);

    const sig = await sender.sendAndConfirm(
      { instructions: [] },
      signCallback,
      feePayer
    );

    expect(sig.toString()).toBe('rpc_fallback_sig');
    expect(mockRpcClient.sendAndConfirmTransaction).toHaveBeenCalledTimes(1);
  });
});
