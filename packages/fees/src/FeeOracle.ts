import { FeeEstimate, FeeOracleConfig, FeeProvider } from './types.js';
import { HelixFeeEstimationError } from '@helix-sdk/core';

export class FeeOracle {
  private readonly config: Required<FeeOracleConfig>;
  private readonly cache = new Map<string, { estimate: FeeEstimate; fetchedAt: number }>();

  constructor(config?: FeeOracleConfig) {
    this.config = {
      providers: config?.providers ?? [],
      fallbackMode: config?.fallbackMode ?? 'cascade',
      cacheTtlMs: config?.cacheTtlMs ?? 5000,
      maxMicrolamportsPerCu: config?.maxMicrolamportsPerCu ?? 1000000,
      minMicrolamportsPerCu: config?.minMicrolamportsPerCu ?? 1000,
    };
  }

  /**
   * Estimates priority fee per compute unit for a set of program IDs.
   * Caches results to avoid hammering endpoints.
   */
  public async estimateFee(programIds: string[], abortSignal?: AbortSignal): Promise<FeeEstimate> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    const sortedIds = [...programIds].sort();
    const cacheKey = sortedIds.join(',');
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < this.config.cacheTtlMs) {
      return cached.estimate;
    }

    const providers = this.config.providers;
    if (providers.length === 0) {
      // Fallback if no providers are configured (default static fallback)
      const staticEstimate: FeeEstimate = {
        microlamportsPerCu: 5000, // Static floor 5,000
        estimatedLamportsCost: BigInt(Math.round((5000 * 200000) / 1000000)),
        source: 'static_fallback',
        confidence: 'low',
      };
      this.cache.set(cacheKey, { estimate: staticEstimate, fetchedAt: now });
      return staticEstimate;
    }

    let estimate: FeeEstimate;

    if (this.config.fallbackMode === 'cascade') {
      estimate = await this.executeCascade(providers, programIds, abortSignal);
    } else {
      estimate = await this.executeMedian(providers, programIds, abortSignal);
    }

    // Clamp values
    let rate = estimate.microlamportsPerCu;
    if (rate < this.config.minMicrolamportsPerCu) {
      rate = this.config.minMicrolamportsPerCu;
    }
    if (rate > this.config.maxMicrolamportsPerCu) {
      rate = this.config.maxMicrolamportsPerCu;
    }

    const clampedEstimate: FeeEstimate = {
      ...estimate,
      microlamportsPerCu: rate,
      estimatedLamportsCost: BigInt(Math.round((rate * (estimate.computeUnitsEstimate ?? 200000)) / 1000000)),
    };

    this.cache.set(cacheKey, { estimate: clampedEstimate, fetchedAt: now });
    return clampedEstimate;
  }

  private async executeCascade(
    providers: readonly FeeProvider[],
    programIds: string[],
    abortSignal?: AbortSignal
  ): Promise<FeeEstimate> {
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const est = await provider.estimateFee(programIds, abortSignal);
        return est;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new HelixFeeEstimationError(
      `All fee providers in cascade failed: ${lastError?.message}`,
      'cascade',
      undefined,
      lastError
    );
  }

  private async executeMedian(
    providers: readonly FeeProvider[],
    programIds: string[],
    abortSignal?: AbortSignal
  ): Promise<FeeEstimate> {
    const promises = providers.map((p) => p.estimateFee(programIds, abortSignal));
    const results = await Promise.allSettled(promises);

    const successfulEstimates: FeeEstimate[] = [];
    let lastError: Error | null = null;

    for (let i = 0; i < results.length; i++) {
      const res = results[i]!;
      if (res.status === 'fulfilled') {
        successfulEstimates.push(res.value);
      } else {
        lastError = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
      }
    }

    if (successfulEstimates.length === 0) {
      throw new HelixFeeEstimationError(
        `All fee providers in median mode failed: ${lastError?.message}`,
        'median',
        undefined,
        lastError
      );
    }

    // Sort to compute the median
    successfulEstimates.sort((a, b) => a.microlamportsPerCu - b.microlamportsPerCu);
    const mid = Math.floor(successfulEstimates.length / 2);
    const medianRate =
      successfulEstimates.length % 2 !== 0
        ? successfulEstimates[mid]!.microlamportsPerCu
        : (successfulEstimates[mid - 1]!.microlamportsPerCu +
            successfulEstimates[mid]!.microlamportsPerCu) /
          2;

    const bestEstimate = successfulEstimates[mid]!;

    return {
      microlamportsPerCu: Math.round(medianRate),
      estimatedLamportsCost: BigInt(Math.round((medianRate * 200000) / 1000000)),
      source: `median(${successfulEstimates.map((e) => e.source).join(',')})`,
      confidence: bestEstimate.confidence,
    };
  }

  /**
   * Clears the cache.
   */
  public clear(): void {
    this.cache.clear();
  }
}
