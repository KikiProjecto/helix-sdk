import { FeeEstimate, FeeProvider } from '../types.js';
import { HelixFeeEstimationError } from '@helix-sdk/core';

export class HeliusFeeProvider implements FeeProvider {
  public readonly name = 'helius';
  private readonly heliusUrl: string;

  constructor(heliusUrlOrApiKey: string) {
    if (heliusUrlOrApiKey.startsWith('http')) {
      this.heliusUrl = heliusUrlOrApiKey;
    } else {
      this.heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusUrlOrApiKey}`;
    }
  }

  public async estimateFee(programIds: string[], abortSignal?: AbortSignal): Promise<FeeEstimate> {
    try {
      const response = await fetch(this.heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getPriorityFeeEstimate',
          params: [
            {
              accountKeys: programIds,
              options: {
                recommended: true,
              },
            },
          ],
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(`Helius API error: ${JSON.stringify(json.error)}`);
      }

      const estimate = json.result?.priorityFeeEstimate;
      if (typeof estimate !== 'number') {
        throw new Error('Invalid priorityFeeEstimate response from Helius');
      }

      return {
        microlamportsPerCu: Math.round(estimate),
        estimatedLamportsCost: BigInt(Math.round((estimate * 200000) / 1000000)), // Estimate based on a standard 200k CU tx
        source: 'helius',
        confidence: 'high',
      };
    } catch (err) {
      throw new HelixFeeEstimationError(
        `Failed to estimate fee using Helius provider: ${err instanceof Error ? err.message : String(err)}`,
        'helius',
        undefined,
        err
      );
    }
  }
}
