import {
  Address,
  Commitment,
  Signature,
  appendTransactionMessageInstruction,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from '@solana/web3.js';
import { HelixRpcClient, HelixLogger, createNoopLogger } from '@helix-sdk/core';
import { JitoClient } from './JitoClient.js';

export interface JitoFallbackSenderConfig {
  logger?: HelixLogger;
}

export class JitoFallbackSender {
  private readonly logger: HelixLogger;

  constructor(
    private readonly jitoClient: JitoClient,
    private readonly rpcClient: HelixRpcClient,
    config?: JitoFallbackSenderConfig
  ) {
    this.logger = config?.logger ?? createNoopLogger();
  }

  /**
   * Attempts to send the transaction as a Jito bundle with a tip.
   * If Jito fails, rejects, or times out, signs the original transaction and sends it via standard RPC.
   * @param txMessage The functional transaction message.
   * @param signTransaction A callback function to sign a transaction message.
   * @param feePayer The address of the transaction fee payer.
   * @param options Sending and confirmation options.
   * @returns The transaction signature.
   */
  public async sendAndConfirm(
    txMessage: any,
    signTransaction: (tx: any) => Promise<any>,
    feePayer: Address,
    options?: {
      commitment?: Commitment;
      abortSignal?: AbortSignal;
    }
  ): Promise<Signature> {
    const commitment = options?.commitment ?? 'confirmed';
    const abortSignal = options?.abortSignal;

    try {
      this.logger.info('Attempting transaction routing via Jito bundle...');
      
      // 1. Create Jito tip instruction
      const { instruction: tipInstruction, tipAccount, tipLamports } =
        await this.jitoClient.createTipInstruction(feePayer, abortSignal);

      // 2. Append tip instruction to transaction message (returns a new immutable message in v2.0)
      const jitoTxMessage = appendTransactionMessageInstruction(tipInstruction, txMessage);

      // 3. Sign the transaction message with the tip
      const signedJitoTx = await signTransaction(jitoTxMessage);
      const signature = getSignatureFromTransaction(signedJitoTx);
      const wireTx = getBase64EncodedWireTransaction(signedJitoTx);

      // 4. Submit via Jito block engine
      const bundleResult = await this.jitoClient.sendBundle(
        {
          transactions: [wireTx],
          tipAccountAddress: tipAccount,
          tipLamports,
        },
        abortSignal
      );

      if (bundleResult.status === 'accepted') {
        this.logger.info(`Jito bundle accepted and landed in slot ${bundleResult.slot}`);
        return signature;
      }

      this.logger.warn(
        `Jito bundle was ${bundleResult.status}. Falling back to standard RPC...`,
        { error: bundleResult.error }
      );
    } catch (err) {
      this.logger.warn(
        'Failed to construct or send Jito bundle. Falling back to standard RPC...',
        { error: err instanceof Error ? err.message : String(err) }
      );
    }

    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    // Fallback: Sign the original transaction without the tip, and send via standard RPC client
    this.logger.info('Routing transaction via standard RPC fallback client...');
    const signedOriginalTx = await signTransaction(txMessage);
    return this.rpcClient.sendAndConfirmTransaction(signedOriginalTx, {
      commitment,
      abortSignal,
    });
  }
}
