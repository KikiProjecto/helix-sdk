import { BundleResult } from './types.js';

export interface BundleTrackerConfig {
  endpointUrl: string;
  timeoutMs?: number;                   // default: 30_000ms
  initialPollDelayMs?: number;          // default: 500ms
  maxPollDelayMs?: number;              // default: 4000ms
  pollMultiplier?: number;              // default: 1.5
}

export class BundleTracker {
  private readonly config: Required<BundleTrackerConfig>;

  constructor(config: BundleTrackerConfig) {
    this.config = {
      endpointUrl: config.endpointUrl,
      timeoutMs: config.timeoutMs ?? 30000,
      initialPollDelayMs: config.initialPollDelayMs ?? 500,
      maxPollDelayMs: config.maxPollDelayMs ?? 4000,
      pollMultiplier: config.pollMultiplier ?? 1.5,
    };
  }

  /**
   * Tracks a bundle's status by polling Jito's getBundleStatuses endpoint.
   * Respects AbortSignal.
   */
  public async track(bundleId: string, abortSignal?: AbortSignal): Promise<BundleResult> {
    const startTime = Date.now();
    let pollDelay = this.config.initialPollDelayMs;

    while (Date.now() - startTime < this.config.timeoutMs) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new Error('Aborted');
      }

      try {
        const statuses = await this.getBundleStatuses([bundleId], abortSignal);
        if (statuses && statuses.length > 0) {
          const status = statuses[0];
          if (status) {
            // Check for rejection/error first
            if (status.err) {
              return {
                bundleId,
                status: 'rejected',
                slot: status.slot,
                error: JSON.stringify(status.err),
              };
            }

            // Check if it landed
            const confirmation = status.confirmation_status;
            if (confirmation === 'processed' || confirmation === 'confirmed' || confirmation === 'finalized') {
              return {
                bundleId,
                status: 'accepted',
                slot: status.slot,
              };
            }
          }
        }
      } catch (err) {
        // Suppress transient query errors and let poll continue
      }

      // Wait before next poll
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timeoutId);
          reject(abortSignal?.reason ?? new Error('Aborted'));
        };

        const timeoutId = setTimeout(() => {
          abortSignal?.removeEventListener('abort', onAbort);
          resolve();
        }, pollDelay);

        abortSignal?.addEventListener('abort', onAbort);
      });

      // Exponential backoff
      pollDelay = Math.min(pollDelay * this.config.pollMultiplier, this.config.maxPollDelayMs);
    }

    return {
      bundleId,
      status: 'timeout',
      error: `Bundle tracking timed out after ${this.config.timeoutMs}ms`,
    };
  }

  /**
   * Makes the JSON-RPC request to getBundleStatuses.
   */
  private async getBundleStatuses(
    bundleIds: string[],
    abortSignal?: AbortSignal
  ): Promise<any[] | null> {
    const response = await fetch(`${this.config.endpointUrl}/api/v1/bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: [bundleIds],
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`Jito RPC error: ${JSON.stringify(json.error)}`);
    }

    return json.result?.value ?? null;
  }
}
