import {
  Commitment,
  Rpc,
  Signature,
  SolanaRpcApi,
  createSolanaRpc,
} from '@solana/web3.js';

import { EndpointHealthMonitor } from '../pool/EndpointHealthMonitor.js';
import { FallbackChain } from '../pool/FallbackChain.js';
import { BlockhashCache } from '../transaction/BlockhashCache.js';
import { TransactionSender } from '../transaction/TransactionSender.js';
import {
  EndpointConfig,
  EndpointHealth,
  FallbackChainConfig,
  HelixLogger,
  MetricsSnapshot,
  RpcPoolConfig,
} from '../types/index.js';
import { createDefaultLogger } from '../utils/logger.js';

export interface HelixRpcClientExtensions {
  /**
   * The active endpoint health monitor.
   */
  monitor: EndpointHealthMonitor;
  /**
   * The resilience fallback chain.
   */
  fallbackChain: FallbackChain;
  /**
   * The transaction blockhash cache.
   */
  blockhashCache: BlockhashCache;
  /**
   * Sends and confirms a transaction using background retry and pool routing.
   * @param tx The signed transaction.
   * @param options Transaction sending and confirmation options.
   * @returns The transaction signature.
   */
  sendAndConfirmTransaction(
    tx: Parameters<typeof getSignatureFromTransaction>[0],
    options?: {
      commitment?: Commitment;
      lastValidBlockHeight?: bigint;
      abortSignal?: AbortSignal;
    }
  ): Promise<Signature>;
  /**
   * Retrieves the current health status of the pool.
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    endpoints: EndpointHealth[];
  };
  /**
   * Retrieves a snapshot of current metrics.
   */
  getMetrics(): MetricsSnapshot;
  /**
   * Cleans up background monitors and caches.
   */
  destroy(): Promise<void>;
}

export type HelixRpcClient = Rpc<SolanaRpcApi> & HelixRpcClientExtensions;

// Helper to make TS signature checks happy without raw type import conflicts
import { getSignatureFromTransaction } from '@solana/web3.js';

/**
 * Underlying implementation class for Helix RPC operations.
 */
export class HelixRpcClientImpl {
  public readonly monitor: EndpointHealthMonitor;
  public readonly fallbackChain: FallbackChain;
  public readonly blockhashCache: BlockhashCache;
  private readonly transactionSender: TransactionSender;
  private readonly clients = new Map<string, ReturnType<typeof createSolanaRpc>>();
  private readonly logger: HelixLogger;
  public readonly endpoints: readonly EndpointConfig[];

  /**
   * @param poolConfig Pool configurations.
   * @param fallbackConfig Fallback chain and retry configurations.
   */
  constructor(
    poolConfig: RpcPoolConfig,
    fallbackConfig?: FallbackChainConfig
  ) {
    this.logger = poolConfig.logger ?? createDefaultLogger();
    this.endpoints = poolConfig.endpoints;
    this.monitor = new EndpointHealthMonitor(poolConfig);

    const actualFallbackConfig: FallbackChainConfig = {
      retryPolicy: fallbackConfig?.retryPolicy ?? {
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2.0,
        jitterFactor: 0.25,
        retryableErrors: [
          'ECONNREFUSED',
          'ECONNRESET',
          'ETIMEDOUT',
          'HTTP_429',
          'HTTP_503',
          'SolanaBlockhashNotFound',
          'SolanaSlotSkipped',
        ],
      },
      onEndpointFail: fallbackConfig?.onEndpointFail,
      onFallback: fallbackConfig?.onFallback,
      onExhausted: fallbackConfig?.onExhausted,
    };

    this.fallbackChain = new FallbackChain(
      poolConfig.endpoints,
      this.monitor,
      actualFallbackConfig,
      this.logger
    );

    const proxyClient = createHelixClientProxy(this);

    this.blockhashCache = new BlockhashCache(
      async (commitment) => {
        const res = await this.fallbackChain.execute(async (url, execOptions) => {
          return this.getClient(url).getLatestBlockhash({ commitment }).send({
            abortSignal: execOptions.abortSignal,
          });
        });
        return {
          blockhash: res.value.blockhash,
          lastValidBlockHeight: BigInt(res.value.lastValidBlockHeight),
        };
      },
      async () => {
        const res = await this.fallbackChain.execute(async (url, execOptions) => {
          return this.getClient(url).getSlot().send({
            abortSignal: execOptions.abortSignal,
          });
        });
        return BigInt(res);
      }
    );

    // Cast the proxy to comply with structural requirements
    this.transactionSender = new TransactionSender(proxyClient as any, {}, this.logger);
    this.monitor.start();
  }

  /**
   * Lazy load client wrapper per URL to reuse connections.
   */
  public getClient(url: string): ReturnType<typeof createSolanaRpc> {
    let client = this.clients.get(url);
    if (!client) {
      client = createSolanaRpc(url);
      this.clients.set(url, client);
    }
    return client;
  }

  /**
   * Sends and confirms a transaction using core TransactionSender.
   */
  public async sendAndConfirmTransaction(
    tx: Parameters<typeof getSignatureFromTransaction>[0],
    options?: {
      commitment?: Commitment;
      lastValidBlockHeight?: bigint;
      abortSignal?: AbortSignal;
    }
  ): Promise<Signature> {
    return this.transactionSender.sendAndConfirm(tx, options);
  }

  /**
   * Evaluates overall pool health based on monitor states.
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    endpoints: EndpointHealth[];
  } {
    const endpoints = this.monitor.getAllHealth();
    let healthyCount = 0;
    let degradedCount = 0;

    for (const ep of endpoints) {
      if (ep.status === 'healthy') healthyCount++;
      else if (ep.status === 'degraded') degradedCount++;
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyCount === 0) {
      status = degradedCount > 0 ? 'degraded' : 'unhealthy';
    }

    return { status, endpoints };
  }

  /**
   * Formulates current health monitor metrics.
   */
  public getMetrics(): MetricsSnapshot {
    const health = this.getHealthStatus();
    return {
      timestamp: Date.now(),
      endpoints: health.endpoints,
      healthyNodes: health.endpoints.filter((e) => e.status === 'healthy').length,
      degradedNodes: health.endpoints.filter((e) => e.status === 'degraded').length,
      unhealthyNodes: health.endpoints.filter((e) => e.status === 'unhealthy').length,
      totalRequests: this.monitor.getTotalRequests(),
      totalErrors: this.monitor.getTotalErrors(),
    };
  }

  /**
   * Destroys resources and stops check schedules.
   */
  public async destroy(): Promise<void> {
    this.monitor.stop();
    this.blockhashCache.clear();
  }
}

/**
 * Wraps HelixRpcClientImpl inside a Proxy to dynamically intercept standard Solana RPC requests.
 */
function createHelixClientProxy(impl: HelixRpcClientImpl): HelixRpcClient {
  return new Proxy(impl, {
    get(target, prop) {
      if (
        prop === 'destroy' ||
        prop === 'getHealthStatus' ||
        prop === 'getMetrics' ||
        prop === 'sendAndConfirmTransaction' ||
        prop === 'monitor' ||
        prop === 'fallbackChain' ||
        prop === 'blockhashCache' ||
        prop === 'endpoints'
      ) {
        return Reflect.get(target, prop);
      }

      if (prop === 'getLatestBlockhash') {
        return (config?: Readonly<{ commitment?: Commitment; minContextSlot?: bigint }>) => {
          return {
            send: async (options?: { abortSignal?: AbortSignal }) => {
              const targetCommitment = config?.commitment ?? 'confirmed';
              const res = await target.blockhashCache.getBlockhash(
                targetCommitment,
                options?.abortSignal
              );
              return {
                value: {
                  blockhash: res.blockhash,
                  lastValidBlockHeight: Number(res.lastValidBlockHeight),
                },
              };
            },
          };
        };
      }

      return (...args: any[]) => {
        return {
          send: async (options?: { abortSignal?: AbortSignal }) => {
            return target.fallbackChain.execute(async (url, execOptions) => {
              const client = target.getClient(url);
              const method = (client as any)[prop];
              if (typeof method !== 'function') {
                throw new Error(`RPC method ${String(prop)} is not supported by @solana/web3.js`);
              }
              return method(...args).send({
                ...options,
                abortSignal: execOptions.abortSignal,
              });
            }, options?.abortSignal);
          },
        };
      };
    },
  }) as unknown as HelixRpcClient;
}

/**
 * Constructs a resilient Helix RPC client matching standard Web3.js interfaces.
 * @param poolConfig Configuration of the RPC endpoints and threshold parameters.
 * @param fallbackConfig Failover retry specifications.
 * @returns The wrapper client proxy.
 */
export function createHelixClient(
  poolConfig: RpcPoolConfig,
  fallbackConfig?: FallbackChainConfig
): HelixRpcClient {
  const impl = new HelixRpcClientImpl(poolConfig, fallbackConfig);
  return createHelixClientProxy(impl);
}
