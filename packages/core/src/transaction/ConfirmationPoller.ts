import { Commitment, Signature } from '@solana/web3.js';

import {
  HelixBlockhashExpiredError,
  HelixRpcError,
  HelixTransactionTimeoutError,
} from '../errors/HelixErrors.js';

interface RpcSubset {
  getSignatureStatuses(signatures: readonly Signature[]): {
    send(options?: { abortSignal?: AbortSignal }): Promise<{
      value: readonly (null | {
        confirmationStatus: Commitment | null;
        err: unknown;
        slot: bigint | number;
      })[];
    }>;
  };
  getBlockHeight(): {
    send(options?: { abortSignal?: AbortSignal }): Promise<bigint | number>;
  };
}

/**
 * Periodically queries signature status and block height to confirm transaction landing or detect expiration.
 */
export class ConfirmationPoller {
  private readonly targetRank: number;
  private readonly ranks: Record<string, number> = { processed: 1, confirmed: 2, finalized: 3 };

  /**
   * @param rpc RPC client instance.
   * @param signature The transaction signature to poll.
   * @param lastValidBlockHeight The block height at which the transaction is considered expired.
   * @param targetCommitment The desired confirmation target.
   * @param pollIntervalMs Interval between status checks.
   * @param timeoutMs Maximum duration to wait before timing out.
   */
  constructor(
    private readonly rpc: RpcSubset,
    private readonly signature: Signature,
    private readonly lastValidBlockHeight: bigint,
    targetCommitment: Commitment = 'confirmed',
    private readonly pollIntervalMs: number = 2000,
    private readonly timeoutMs: number = 60000
  ) {
    this.targetRank = this.ranks[targetCommitment] ?? 2;
  }

  /**
   * Runs the polling loop until confirmation, expiration, or timeout.
   * @param abortSignal Optional AbortSignal.
   * @returns The slot number at which the transaction confirmed.
   * @throws {HelixBlockhashExpiredError} If block height is exceeded.
   * @throws {HelixTransactionTimeoutError} If timeout is exceeded.
   * @throws {HelixRpcError} If the transaction failed on-chain.
   */
  public async confirm(abortSignal?: AbortSignal): Promise<{ slot: bigint }> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeoutMs) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new Error('Aborted');
      }

      try {
        // 1. Fetch signature status
        const statusRes = await this.rpc.getSignatureStatuses([this.signature]).send({ abortSignal });
        const status = statusRes.value?.[0];

        if (status) {
          if (status.err) {
            throw new HelixRpcError(
              `Transaction ${this.signature} failed on-chain`,
              'pool',
              'getSignatureStatuses',
              1,
              { err: status.err }
            );
          }

          const currentRank = this.ranks[status.confirmationStatus ?? ''] ?? 0;
          if (currentRank >= this.targetRank) {
            return { slot: BigInt(status.slot) };
          }
        }

        // 2. Fetch block height to check for expiration
        const blockHeightRes = await this.rpc.getBlockHeight().send({ abortSignal });
        const currentBlockHeight = BigInt(blockHeightRes);

        if (currentBlockHeight > this.lastValidBlockHeight) {
          throw new HelixBlockhashExpiredError(
            `Transaction expired: current block height ${currentBlockHeight} > lastValidBlockHeight ${this.lastValidBlockHeight}`,
            this.lastValidBlockHeight,
            currentBlockHeight
          );
        }
      } catch (err) {
        if (
          err instanceof HelixBlockhashExpiredError ||
          err instanceof HelixRpcError
        ) {
          throw err;
        }
        // Suppress transient network issues during polling
      }

      // Abort-aware delay
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timeoutId);
          reject(abortSignal?.reason ?? new Error('Aborted'));
        };

        const timeoutId = setTimeout(() => {
          abortSignal?.removeEventListener('abort', onAbort);
          resolve();
        }, this.pollIntervalMs);

        abortSignal?.addEventListener('abort', onAbort);
      });
    }

    throw new HelixTransactionTimeoutError(
      `Transaction confirmation timed out after ${this.timeoutMs}ms`,
      this.signature,
      Date.now() - startTime
    );
  }
}
