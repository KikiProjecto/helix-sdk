import { Commitment } from '@solana/web3.js';

import { BlockhashCacheConfig } from '../types/index.js';

interface CachedEntry {
  blockhash: string;
  lastValidBlockHeight: bigint;
  fetchedAtSlot: bigint;
  fetchedAtTime: number;
}

/**
 * Caches blockhashes with slot-estimation logic to avoid RPC overhead.
 * Handles automatic pre-fetching and ensures blockhashes close to expiry are not used.
 */
export class BlockhashCache {
  private readonly cache = new Map<Commitment, CachedEntry>();
  private readonly isFetching = new Map<Commitment, boolean>();
  private readonly config: Required<BlockhashCacheConfig>;
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * @param fetchBlockhash Callback to fetch a fresh blockhash from the RPC.
   * @param getCurrentSlot Callback to fetch the current slot from the RPC.
   * @param config Configuration for cache TTL and prefetch thresholds.
   */
  constructor(
    private readonly fetchBlockhash: (commitment: Commitment) => Promise<{ blockhash: string; lastValidBlockHeight: bigint }>,
    private readonly getCurrentSlot: () => Promise<bigint>,
    config?: BlockhashCacheConfig
  ) {
    this.config = {
      ttlSlots: config?.ttlSlots ?? 100,
      prefetchThresholdSlots: config?.prefetchThresholdSlots ?? 50,
      commitment: config?.commitment ?? 'confirmed',
    };
  }

  /**
   * Gets a valid blockhash, either from cache or by fetching a new one.
   * Kicks off background pre-fetch if threshold is breached.
   * @param commitment The commitment level.
   * @param abortSignal Optional AbortSignal.
   * @returns The blockhash and its last valid block height.
   */
  public async getBlockhash(
    commitment: Commitment = this.config.commitment,
    abortSignal?: AbortSignal
  ): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    const cached = this.cache.get(commitment);

    if (!cached) {
      this.cacheMisses++;
      return this.fetchAndCache(commitment, abortSignal);
    }

    // Estimate the current slot
    const estimatedSlot = this.estimateCurrentSlot(cached);
    const remainingSlots = cached.lastValidBlockHeight - estimatedSlot;

    // If less than 20 slots remaining, or elapsed slots exceeds TTL, it is expired
    const elapsedSlots = estimatedSlot - cached.fetchedAtSlot;
    const isExpired = remainingSlots < 20n || elapsedSlots > BigInt(this.config.ttlSlots);

    if (isExpired) {
      this.cacheMisses++;
      return this.fetchAndCache(commitment, abortSignal);
    }

    this.cacheHits++;

    // Check if background prefetch is needed (remaining slots below threshold)
    if (remainingSlots < BigInt(this.config.prefetchThresholdSlots)) {
      this.triggerBackgroundPrefetch(commitment);
    }

    return {
      blockhash: cached.blockhash,
      lastValidBlockHeight: cached.lastValidBlockHeight,
    };
  }

  /**
   * Returns current cache hit/miss metrics.
   */
  public getMetrics(): { cacheHits: number; cacheMisses: number } {
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
    };
  }

  /**
   * Clears the cache.
   */
  public clear(): void {
    this.cache.clear();
    this.isFetching.clear();
  }

  /**
   * Estimates the current slot height based on elapsed time since cache load (400ms per slot).
   */
  private estimateCurrentSlot(entry: CachedEntry): bigint {
    const elapsedMs = Date.now() - entry.fetchedAtTime;
    const elapsedSlots = BigInt(Math.floor(elapsedMs / 400));
    return entry.fetchedAtSlot + elapsedSlots;
  }

  /**
   * Fetches a fresh blockhash and updates the cache.
   */
  private async fetchAndCache(
    commitment: Commitment,
    abortSignal?: AbortSignal
  ): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    this.isFetching.set(commitment, true);
    try {
      // Fetch slot first to anchor time-slot correlation
      const slot = await this.getCurrentSlot();
      const res = await this.fetchBlockhash(commitment);

      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new Error('Aborted');
      }

      this.cache.set(commitment, {
        blockhash: res.blockhash,
        lastValidBlockHeight: res.lastValidBlockHeight,
        fetchedAtSlot: slot,
        fetchedAtTime: Date.now(),
      });

      return res;
    } finally {
      this.isFetching.delete(commitment);
    }
  }

  /**
   * Kicks off a non-blocking background fetch to refresh the blockhash.
   */
  private triggerBackgroundPrefetch(commitment: Commitment): void {
    if (this.isFetching.get(commitment)) return;

    this.isFetching.set(commitment, true);
    this.fetchAndCache(commitment).catch(() => {
      // Quiet fail on background prefetch to avoid crashing caller
    }).finally(() => {
      this.isFetching.delete(commitment);
    });
  }
}
