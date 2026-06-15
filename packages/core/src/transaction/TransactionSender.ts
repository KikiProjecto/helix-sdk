import {
  Commitment,
  Signature,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from '@solana/web3.js';

import {
  HelixBlockhashExpiredError,
  HelixConfigError,
} from '../errors/HelixErrors.js';
import { HelixLogger } from '../types/index.js';
import { createNoopLogger } from '../utils/logger.js';
import { ConfirmationPoller } from './ConfirmationPoller.js';

export interface TransactionSenderConfig {
  confirmationTimeout?: number; // default: 60_000ms
  resendIntervalMs?: number; // default: 5_000ms
  onConfirmation?: (sig: Signature, slot: number) => void;
  onRetry?: (attempt: number, reason: string) => void;
  onBlockhashExpiry?: () => void; // fired when tx must be rebuilt
}

interface RpcSubset {
  sendTransaction(
    txBytes: string,
    options?: { skipPreflight?: boolean }
  ): { send(options?: { abortSignal?: AbortSignal }): Promise<Signature> };
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
 * Handles sending and confirming signed transactions.
 * Manages background resending and integrates with ConfirmationPoller for landing detection and blockhash expiration.
 */
export class TransactionSender {
  private readonly config: Required<TransactionSenderConfig>;
  private readonly logger: HelixLogger;

  /**
   * @param rpc RPC client instance.
   * @param config Configuration for sending and confirmation.
   * @param logger Pluggable logger.
   */
  constructor(
    private readonly rpc: RpcSubset,
    config?: TransactionSenderConfig,
    logger?: HelixLogger
  ) {
    this.logger = logger ?? createNoopLogger();
    this.config = {
      confirmationTimeout: config?.confirmationTimeout ?? 60000,
      resendIntervalMs: config?.resendIntervalMs ?? 5000,
      onConfirmation: config?.onConfirmation ?? (() => {}),
      onRetry: config?.onRetry ?? (() => {}),
      onBlockhashExpiry: config?.onBlockhashExpiry ?? (() => {}),
    };
  }

  /**
   * Sends the transaction and waits for confirmation.
   * Periodically resends the transaction in the background.
   * @param tx The signed transaction object.
   * @param options Confirmation options.
   * @returns The transaction signature.
   * @throws {HelixBlockhashExpiredError} If the blockhash expires before confirmation.
   * @throws {HelixTransactionTimeoutError} If confirmation times out.
   */
  public async sendAndConfirm(
    tx: Parameters<typeof getSignatureFromTransaction>[0],
    options?: {
      commitment?: Commitment;
      lastValidBlockHeight?: bigint;
      abortSignal?: AbortSignal;
    }
  ): Promise<Signature> {
    const signature = getSignatureFromTransaction(tx);
    const wireTx = getBase64EncodedWireTransaction(tx);

    let lastValidBlockHeight = options?.lastValidBlockHeight;
    if (!lastValidBlockHeight && tx && typeof tx === 'object') {
      const txObj = tx as {
        lifetimeConstraint?: { lastValidBlockHeight: bigint };
      };
      if (txObj.lifetimeConstraint?.lastValidBlockHeight) {
        lastValidBlockHeight = txObj.lifetimeConstraint.lastValidBlockHeight;
      }
    }

    if (!lastValidBlockHeight) {
      throw new HelixConfigError(
        'Transaction missing blockheight constraint',
        'lastValidBlockHeight',
        lastValidBlockHeight,
        'Could not extract lastValidBlockHeight from transaction, please provide it in options'
      );
    }

    const commitment = options?.commitment ?? 'confirmed';
    const abortSignal = options?.abortSignal;

    this.logger.info(`Sending transaction ${signature}...`);

    let resendIntervalId: NodeJS.Timeout | null = null;
    let attempt = 0;

    const pollIntervalMs = Math.max(10, Math.min(2000, this.config.confirmationTimeout / 10));

    const poller = new ConfirmationPoller(
      this.rpc,
      signature,
      lastValidBlockHeight,
      commitment,
      pollIntervalMs,
      this.config.confirmationTimeout
    );

    try {
      // 1. Initial send
      await this.rpc
        .sendTransaction(wireTx, { skipPreflight: true })
        .send({ abortSignal });

      // 2. Start background resend loop
      resendIntervalId = setInterval(() => {
        attempt++;
        this.logger.debug(
          `Resending transaction ${signature} (attempt ${attempt})...`
        );
        this.config.onRetry(attempt, 'resend');
        this.rpc
          .sendTransaction(wireTx, { skipPreflight: true })
          .send({ abortSignal })
          .catch((err) => {
            this.logger.debug(`Background resend failed for ${signature}`, {
              error: String(err),
            });
          });
      }, this.config.resendIntervalMs);

      // 3. Wait for confirmation via poller
      const { slot } = await poller.confirm(abortSignal);

      this.logger.info(`Transaction ${signature} confirmed in slot ${slot}`);
      this.config.onConfirmation(signature, Number(slot));

      return signature;
    } catch (err) {
      if (err instanceof HelixBlockhashExpiredError) {
        this.logger.error(
          `Transaction ${signature} expired: blockheight exceeded`
        );
        this.config.onBlockhashExpiry();
      }
      throw err;
    } finally {
      if (resendIntervalId) {
        clearInterval(resendIntervalId);
      }
    }
  }
}
