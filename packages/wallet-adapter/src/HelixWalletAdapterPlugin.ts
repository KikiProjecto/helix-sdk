import { HelixRpcClient } from '@helix-sdk/core';
import { JitoClient } from '@helix-sdk/jito';
import { FeeOracle } from '@helix-sdk/fees';
import { Base64EncodedWireTransaction, address } from '@solana/web3.js';

export interface HelixWalletAdapterPluginConfig {
  client: HelixRpcClient;
  jito?: {
    enabled: boolean;
    jitoClient: JitoClient;
    tipLamports?: bigint;
    tipMode?: 'fixed' | 'dynamic';
  };
  fees?: {
    enabled: boolean;
    feeOracle: FeeOracle;
    defaultUnits?: number;
  };
}

export class HelixWalletAdapterPlugin {
  constructor(private readonly config: HelixWalletAdapterPluginConfig) {}

  /**
   * Wraps a standard Solana wallet adapter with resilience and auto-enhancement middleware.
   * @param adapter The standard wallet adapter instance to wrap.
   * @returns An enhanced wallet adapter instance.
   */
  public wrap<T extends any>(adapter: T): T & { original: T } {
    const plugin = this;

    return new Proxy(adapter as any, {
      get(target, prop, receiver) {
        if (prop === 'original') {
          return target;
        }

        if (prop === 'sendTransaction') {
          return async (transaction: any, connection: any, options?: any) => {
            return plugin.sendTransaction(target, transaction, connection, options);
          };
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
    }) as T & { original: T };
  }

  private async sendTransaction(
    adapter: any,
    transaction: any,
    connection: any,
    options?: any
  ): Promise<string> {
    const feePayer = transaction.feePayer || adapter.publicKey;
    if (!feePayer) {
      throw new Error('Transaction fee payer or adapter public key is required.');
    }

    const PublicKeyConstructor = feePayer.constructor;

    // Extract unique program IDs from transaction instructions
    const programIds = transaction.instructions
      ? Array.from(new Set<string>(transaction.instructions.map((ix: any) => ix.programId.toBase58())))
      : [];

    // 1. Dynamic Fee Injection
    if (this.config.fees?.enabled) {
      const oracle = this.config.fees.feeOracle;
      const defaultUnits = this.config.fees.defaultUnits ?? 200000;
      
      try {
        const estimate = await oracle.estimateFee(programIds);
        const cuLimit = estimate.computeUnitsEstimate ?? defaultUnits;
        const cuPrice = estimate.microlamportsPerCu;

        // Prepend SetComputeUnitLimit instruction
        const limitData = new Uint8Array(5);
        const limitView = new DataView(limitData.buffer);
        limitView.setUint8(0, 2); // SetComputeUnitLimit
        limitView.setUint32(1, cuLimit, true);
        const limitInstruction = {
          programId: new PublicKeyConstructor('ComputeBudget111111111111111111111111111111'),
          keys: [],
          data: limitData,
        };

        // Prepend SetComputeUnitPrice instruction
        const priceData = new Uint8Array(9);
        const priceView = new DataView(priceData.buffer);
        priceView.setUint8(0, 3); // SetComputeUnitPrice
        priceView.setBigUint64(1, BigInt(cuPrice), true);
        const priceInstruction = {
          programId: new PublicKeyConstructor('ComputeBudget111111111111111111111111111111'),
          keys: [],
          data: priceData,
        };

        if (transaction.instructions && Array.isArray(transaction.instructions)) {
          // Remove existing compute budget instructions if present
          transaction.instructions = transaction.instructions.filter(
            (ix: any) => ix.programId.toBase58() !== 'ComputeBudget111111111111111111111111111111'
          );
          transaction.instructions.unshift(limitInstruction, priceInstruction);
        }
      } catch (err) {
        // Fallback or ignore if fee estimation fails
      }
    }

    // 2. Jito Tip Injection
    let tipAccountToUse: any = null;
    let tipAmount = 1000n;
    if (this.config.jito?.enabled) {
      const jitoClient = this.config.jito.jitoClient;
      try {
        const tipAccounts = await jitoClient.getTipAccounts();
        if (tipAccounts.length > 0) {
          // Select a random tip account
          const tipAccountStr = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
          tipAccountToUse = new PublicKeyConstructor(tipAccountStr);
          
          if (this.config.jito.tipMode === 'dynamic') {
            const oracleTip = await jitoClient.tipOracle.getRecommendedTip('p50');
            if (oracleTip) {
              tipAmount = oracleTip;
            }
          } else if (this.config.jito.tipLamports) {
            tipAmount = this.config.jito.tipLamports;
          }

          // Prepend System Transfer instruction for tip to the transaction
          const systemProgramId = new PublicKeyConstructor('11111111111111111111111111111111');
          const tipData = new Uint8Array(12);
          const tipView = new DataView(tipData.buffer);
          tipView.setUint32(0, 2, true); // SystemProgram transfer
          tipView.setBigUint64(4, BigInt(tipAmount), true);

          const tipInstruction = {
            programId: systemProgramId,
            keys: [
              { pubkey: feePayer, isSigner: true, isWritable: true },
              { pubkey: tipAccountToUse, isSigner: false, isWritable: true },
            ],
            data: tipData,
          };

          if (transaction.instructions && Array.isArray(transaction.instructions)) {
            transaction.instructions.push(tipInstruction);
          }
        }
      } catch (err) {
        // Ignore tip injection errors, fall back to normal send
      }
    }

    // 3. Proxy the connection object to intercept sendRawTransaction
    const plugin = this;
    const proxiedConnection = new Proxy(connection, {
      get(target, prop, receiver) {
        if (prop === 'sendRawTransaction') {
          return async (rawTransaction: Uint8Array | Buffer, sendOptions?: any) => {
            const txBase64 = Buffer.from(rawTransaction).toString('base64');
            
            // Route through Jito first if enabled
            if (plugin.config.jito?.enabled && tipAccountToUse) {
              try {
                const jitoClient = plugin.config.jito.jitoClient;
                const bundleResult = await jitoClient.sendBundle({
                  transactions: [txBase64 as Base64EncodedWireTransaction],
                  tipAccountAddress: address(tipAccountToUse.toBase58()),
                  tipLamports: tipAmount,
                });
                if (bundleResult.status === 'accepted') {
                  // Since Jito accepted, we can use the Helix RPC client to wait for confirmation
                  // or return it. We'll fallback to sending via core to track confirmation
                }
              } catch (err) {
                // Ignore and fallback
              }
            }

            // Route through Helix RPC client
            try {
              const signature = await plugin.config.client.sendTransaction(txBase64 as Base64EncodedWireTransaction, {
                skipPreflight: sendOptions?.skipPreflight ?? true,
              }).send();
              return signature;
            } catch (err) {
              // Final fallback to the original connection
              const originalSendRawTransaction = Reflect.get(target, prop, receiver);
              return originalSendRawTransaction.call(target, rawTransaction, sendOptions);
            }
          };
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
    });

    // 4. Submit to original adapter with the proxied connection
    return adapter.sendTransaction(transaction, proxiedConnection, options);
  }
}

