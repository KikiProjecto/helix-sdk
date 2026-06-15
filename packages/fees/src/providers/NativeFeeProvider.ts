import { FeeEstimate, FeeProvider } from '../types.js';
import { HelixFeeEstimationError } from '@helix-sdk/core';
import { address } from '@solana/web3.js';

export class NativeFeeProvider implements FeeProvider {
  public readonly name = 'native';

  constructor(private readonly rpcClient: any) {}

  public async estimateFee(programIds: string[], abortSignal?: AbortSignal): Promise<FeeEstimate> {
    try {
      const addresses = programIds.map((id) => address(id));
      const res = await this.rpcClient.getRecentPrioritizationFees(addresses).send({ abortSignal });

      if (!Array.isArray(res)) {
        throw new Error('Invalid response from getRecentPrioritizationFees');
      }

      const fees = res.map((f: any) => Number(f.prioritizationFee)).sort((a, b) => a - b);
      let medianFee = 0;
      if (fees.length > 0) {
        const mid = Math.floor(fees.length / 2);
        medianFee = fees.length % 2 !== 0 ? fees[mid]! : (fees[mid - 1]! + fees[mid]!) / 2;
      }

      return {
        microlamportsPerCu: Math.round(medianFee),
        estimatedLamportsCost: BigInt(Math.round((medianFee * 200000) / 1000000)),
        source: 'native',
        confidence: 'medium',
      };
    } catch (err) {
      throw new HelixFeeEstimationError(
        `Failed to estimate fee using native provider: ${err instanceof Error ? err.message : String(err)}`,
        'native',
        undefined,
        err
      );
    }
  }
}
