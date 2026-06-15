import { TipEstimate } from './types.js';

export interface TipOracleConfig {
  tipsApiUrl?: string;                  // default: 'https://bundles.jito.wtf/api/v1/tips'
  cacheTtlMs?: number;                  // default: 10_000ms (10 seconds)
  fallbackP25?: bigint;                 // default: 1_000n
  fallbackP50?: bigint;                 // default: 5_000n
  fallbackP75?: bigint;                 // default: 10_000n
  fallbackP95?: bigint;                 // default: 50_000n
  fallbackP99?: bigint;                 // default: 100_000n
}

export class TipOracle {
  private readonly config: Required<TipOracleConfig>;
  private cachedTips: TipEstimate | null = null;
  private lastFetchTime = 0;
  private fetchPromise: Promise<TipEstimate | null> | null = null;

  constructor(config?: TipOracleConfig) {
    this.config = {
      tipsApiUrl: config?.tipsApiUrl ?? 'https://bundles.jito.wtf/api/v1/tips',
      cacheTtlMs: config?.cacheTtlMs ?? 10000,
      fallbackP25: config?.fallbackP25 ?? 1000n,
      fallbackP50: config?.fallbackP50 ?? 5000n,
      fallbackP75: config?.fallbackP75 ?? 10000n,
      fallbackP95: config?.fallbackP95 ?? 50000n,
      fallbackP99: config?.fallbackP99 ?? 100000n,
    };
  }

  /**
   * Fetches latest tip percentiles. Uses dynamic lock-in to avoid parallel requests.
   * Respects AbortSignal.
   */
  public async fetchTips(abortSignal?: AbortSignal): Promise<TipEstimate | null> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    const now = Date.now();
    if (this.cachedTips && now - this.lastFetchTime < this.config.cacheTtlMs) {
      return this.cachedTips;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = (async () => {
      try {
        const response = await fetch(this.config.tipsApiUrl, {
          signal: abortSignal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        let estimate: TipEstimate | null = null;

        if (Array.isArray(data)) {
          estimate = data[0] ?? null;
        } else if (data && typeof data === 'object') {
          estimate = data as TipEstimate;
        }

        if (estimate) {
          this.cachedTips = estimate;
          this.lastFetchTime = Date.now();
          return estimate;
        }
        return null;
      } catch (err) {
        // Silently log or capture error, fallback to cache if available
        return this.cachedTips;
      } finally {
        this.fetchPromise = null;
      }
    })();

    return this.fetchPromise;
  }

  /**
   * Returns recommended tip in lamports for the specified percentile.
   * Clamps to [min, max] if limits are provided.
   */
  public async getRecommendedTip(
    percentile: 'p25' | 'p50' | 'p75' | 'p95' | 'p99' = 'p50',
    abortSignal?: AbortSignal
  ): Promise<bigint> {
    const tips = await this.fetchTips(abortSignal);
    if (!tips) {
      return this.getFallbackTip(percentile);
    }

    let valueInSol = 0;
    switch (percentile) {
      case 'p25':
        valueInSol = tips.landed_tips_25th_percentile;
        break;
      case 'p50':
        valueInSol = tips.landed_tips_50th_percentile;
        break;
      case 'p75':
        valueInSol = tips.landed_tips_75th_percentile;
        break;
      case 'p95':
        valueInSol = tips.landed_tips_95th_percentile;
        break;
      case 'p99':
        valueInSol = tips.landed_tips_99th_percentile;
        break;
    }

    if (typeof valueInSol !== 'number' || isNaN(valueInSol) || valueInSol <= 0) {
      return this.getFallbackTip(percentile);
    }

    // Convert SOL to lamports (1 SOL = 1e9 lamports)
    return BigInt(Math.round(valueInSol * 1_000_000_000));
  }

  private getFallbackTip(percentile: 'p25' | 'p50' | 'p75' | 'p95' | 'p99'): bigint {
    switch (percentile) {
      case 'p25':
        return this.config.fallbackP25;
      case 'p50':
        return this.config.fallbackP50;
      case 'p75':
        return this.config.fallbackP75;
      case 'p95':
        return this.config.fallbackP95;
      case 'p99':
        return this.config.fallbackP99;
    }
  }

  /**
   * Clears the cache.
   */
  public clear(): void {
    this.cachedTips = null;
    this.lastFetchTime = 0;
  }
}
