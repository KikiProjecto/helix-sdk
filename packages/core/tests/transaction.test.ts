import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Commitment, Signature } from '@solana/web3.js';
import { TransactionSender } from '../src/transaction/TransactionSender.js';
import { ConfirmationPoller } from '../src/transaction/ConfirmationPoller.js';
import { HelixBlockhashExpiredError, HelixTransactionTimeoutError } from '../src/errors/HelixErrors.js';

// Mock Web3.js serialization helpers for simple test payload manipulation
vi.mock('@solana/web3.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...original,
    getSignatureFromTransaction: () => 'mock_sig_123' as unknown as Signature,
    getBase64EncodedWireTransaction: () => 'mock_wire_bytes',
  };
});

describe('TransactionSender & ConfirmationPoller', () => {
  let mockRpc: any;

  beforeEach(() => {
    mockRpc = {
      sendTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue('mock_sig_123'),
      }),
      getSignatureStatuses: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: [{ confirmationStatus: 'confirmed', err: null, slot: 500 }],
        }),
      }),
      getBlockHeight: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(100n),
      }),
    };
  });

  it('ConfirmationPoller successfully resolves slot on confirmation', async () => {
    const poller = new ConfirmationPoller(
      mockRpc,
      'mock_sig_123' as unknown as Signature,
      200n, // lastValidBlockHeight
      'confirmed',
      10, // pollIntervalMs
      200 // timeoutMs
    );

    const { slot } = await poller.confirm();
    expect(slot).toBe(500n);
    expect(mockRpc.getSignatureStatuses).toHaveBeenCalled();
  });

  it('ConfirmationPoller throws HelixBlockhashExpiredError if block height exceeded', async () => {
    // Mock blockheight to exceed the lastValidBlockHeight
    mockRpc.getBlockHeight = vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue(205n),
    });
    mockRpc.getSignatureStatuses = vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({ value: [] }), // not confirmed
    });

    const poller = new ConfirmationPoller(
      mockRpc,
      'mock_sig_123' as unknown as Signature,
      200n, // lastValidBlockHeight
      'confirmed',
      10,
      200
    );

    await expect(poller.confirm()).rejects.toThrow(HelixBlockhashExpiredError);
  });

  it('TransactionSender resends in the background until confirmation', async () => {
    let callCount = 0;
    // Delay signature status update to check that resend runs
    mockRpc.getSignatureStatuses = vi.fn().mockImplementation(() => {
      callCount++;
      return {
        send: vi.fn().mockResolvedValue({
          value: callCount >= 3 ? [{ confirmationStatus: 'confirmed', err: null, slot: 500 }] : [],
        }),
      };
    });

    const retryCallback = vi.fn();
    const sender = new TransactionSender(
      mockRpc,
      {
        resendIntervalMs: 20,
        confirmationTimeout: 500,
        onRetry: retryCallback,
      }
    );

    const tx = {} as any; // Mocked transaction object
    const sig = await sender.sendAndConfirm(tx, {
      commitment: 'confirmed',
      lastValidBlockHeight: 300n,
    });

    expect(sig).toBe('mock_sig_123');
    expect(mockRpc.sendTransaction).toHaveBeenCalled();
    expect(retryCallback).toHaveBeenCalled();
  });
});
