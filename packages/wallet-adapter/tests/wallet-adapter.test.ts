import { describe, it, expect, vi } from 'vitest';
import { HelixWalletAdapterPlugin } from '../src/HelixWalletAdapterPlugin.js';

// Minimal mock classes to avoid importing web3.js classes and comply with "no v1 API imports"
class MockPublicKey {
  constructor(private readonly value: string) {}
  toBase58() {
    return this.value;
  }
}

describe('HelixWalletAdapterPlugin', () => {
  it('should wrap a mock wallet adapter and expose the original instance', () => {
    const originalAdapter = {
      publicKey: new MockPublicKey('11111111111111111111111111111111'),
      sendTransaction: vi.fn(),
    };

    const plugin = new HelixWalletAdapterPlugin({
      client: {} as any,
    });

    const wrapped = plugin.wrap(originalAdapter);
    expect(wrapped.original).toBe(originalAdapter);
  });

  it('should inject compute budget and Jito tip instructions, and proxy connection sendRawTransaction', async () => {
    const originalAdapter = {
      publicKey: new MockPublicKey('11111111111111111111111111111111'),
      sendTransaction: async (tx: any, conn: any, opts: any) => {
        // Simulate wallet signing and calling connection.sendRawTransaction
        const rawTx = new Uint8Array([0, 1, 2, 3, 4]);
        return conn.sendRawTransaction(rawTx, opts);
      },
    };

    const mockRpcSend = vi.fn().mockResolvedValue('test-signature');
    const mockHelixClient = {
      sendTransaction: vi.fn().mockReturnValue({
        send: mockRpcSend,
      }),
    };

    const mockJitoClient = {
      getTipAccounts: vi.fn().mockResolvedValue(['11111111111111111111111111111111']),
      sendBundle: vi.fn().mockResolvedValue({ status: 'accepted' }),
    };

    const mockFeeOracle = {
      estimateFee: vi.fn().mockResolvedValue({
        computeUnitsEstimate: 150000,
        microlamportsPerCu: 5000,
      }),
    };

    const plugin = new HelixWalletAdapterPlugin({
      client: mockHelixClient as any,
      jito: {
        enabled: true,
        jitoClient: mockJitoClient as any,
        tipLamports: 2000n,
      },
      fees: {
        enabled: true,
        feeOracle: mockFeeOracle as any,
      },
    });

    const wrapped = plugin.wrap(originalAdapter);
    const mockTransaction = {
      instructions: [] as any[],
    };

    const mockConnection = {
      sendRawTransaction: vi.fn().mockResolvedValue('original-signature'),
    };

    const signature = await wrapped.sendTransaction(mockTransaction, mockConnection);

    expect(signature).toBe('test-signature');
    
    // Assert instruction injection happened
    expect(mockTransaction.instructions.length).toBe(3); // CU Limit, CU Price, Jito Tip
    
    // Verify CU limit instruction details
    expect(mockTransaction.instructions[0].programId.toBase58()).toBe('ComputeBudget111111111111111111111111111111');
    expect(mockTransaction.instructions[0].data[0]).toBe(2); // SetComputeUnitLimit code

    // Verify Jito Tip transfer instruction details
    expect(mockTransaction.instructions[2].programId.toBase58()).toBe('11111111111111111111111111111111'); // System program
    expect(mockTransaction.instructions[2].data[0]).toBe(2); // Transfer code

    // Assert JitoClient and FeeOracle were called
    expect(mockFeeOracle.estimateFee).toHaveBeenCalled();
    expect(mockJitoClient.getTipAccounts).toHaveBeenCalled();
    expect(mockJitoClient.sendBundle).toHaveBeenCalled();
    expect(mockHelixClient.sendTransaction).toHaveBeenCalled();
  });
});
