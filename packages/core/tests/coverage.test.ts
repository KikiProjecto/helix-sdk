import { describe, it, expect, vi } from 'vitest';
import { Commitment, Signature } from '@solana/web3.js';

// Mock Web3.js serialization helpers to safely handle dummy transaction objects
vi.mock('@solana/web3.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...original,
    getSignatureFromTransaction: () => 'mock_sig_123' as unknown as Signature,
    getBase64EncodedWireTransaction: () => 'mock_wire_bytes',
  };
});

import { createDefaultLogger } from '../src/utils/logger.js';
import {
  HelixTransactionDroppedError,
  HelixJitoBundleRejectedError,
  HelixFeeEstimationError,
  HelixConfigError,
  HelixError,
  HelixRpcError,
  HelixBlockhashExpiredError,
  HelixTransactionTimeoutError,
  HelixPoolExhaustedError,
} from '../src/errors/HelixErrors.js';
import { RetryPolicy } from '../src/client/RetryPolicy.js';
import { EndpointHealthMonitor } from '../src/pool/EndpointHealthMonitor.js';
import { FallbackChain } from '../src/pool/FallbackChain.js';
import { BlockhashCache } from '../src/transaction/BlockhashCache.js';
import { ConfirmationPoller } from '../src/transaction/ConfirmationPoller.js';
import { TransactionSender } from '../src/transaction/TransactionSender.js';
import { createHelixClient } from '../src/client/HelixRpcClient.js';

describe('Resilience Core Coverage Expansion', () => {
  it('covers console logger outputs', () => {
    const logger = createDefaultLogger();
    const originalLevel = process.env.HELIX_LOG_LEVEL;
    
    process.env.HELIX_LOG_LEVEL = 'debug';
    logger.debug('test debug', { key: 'val' });
    logger.info('test info', { key: 'val' });
    logger.warn('test warn', { key: 'val' });
    logger.error('test error', { key: 'val' });

    process.env.HELIX_LOG_LEVEL = originalLevel;
  });

  it('covers the entire HelixError hierarchy instantiations', () => {
    const base = new HelixError('message', 'CODE', { ctx: 1 }, new Error('cause'));
    expect(base.message).toBe('message');
    expect(base.code).toBe('CODE');
    expect(base.cause).toBeDefined();

    const rpcErr = new HelixRpcError('rpc error', 'https://endpoint', 'getSlot', 2, { ctx: 1 }, new Error('cause'));
    expect(rpcErr.endpoint).toBe('https://endpoint');
    expect(rpcErr.method).toBe('getSlot');
    expect(rpcErr.attempt).toBe(2);

    const dropped = new HelixTransactionDroppedError('dropped', 'sig', 100, 'reason');
    expect(dropped.signature).toBe('sig');
    expect(dropped.slot).toBe(100);
    expect(dropped.reason).toBe('reason');

    const jito = new HelixJitoBundleRejectedError('rejected', 'bundleId', 'reason');
    expect(jito.bundleId).toBe('bundleId');
    expect(jito.reason).toBe('reason');

    const fee = new HelixFeeEstimationError('fee error', 'helius');
    expect(fee.source).toBe('helius');

    const config = new HelixConfigError('config error', 'field', 'value', 'reason');
    expect(config.field).toBe('field');
    expect(config.value).toBe('value');
    expect(config.reason).toBe('reason');
  });

  it('covers RetryPolicy edge cases and abnormal inputs', async () => {
    const policy = new RetryPolicy();
    expect(policy.isRetryable(null)).toBe(false);
    expect(policy.isRetryable(undefined)).toBe(false);
    expect(policy.isRetryable('Random string error')).toBe(false);
    expect(policy.isRetryable({ message: 'Normal error' })).toBe(false);
    expect(policy.isRetryable({ code: 'ECONNRESET', message: 'dropped connection' })).toBe(true);
    expect(policy.isRetryable(new Error('HTTP_503'))).toBe(true);
    expect(policy.isRetryable('429 Too Many Requests')).toBe(true);

    const controller = new AbortController();
    controller.abort(new Error('Already aborted'));
    await expect(policy.executeDelay(1, controller.signal)).rejects.toThrow('Already aborted');
  });

  it('covers EndpointHealthMonitor boundary percentile and pruning rules', () => {
    const monitor = new EndpointHealthMonitor({
      endpoints: [{ url: 'https://rpc1.solana.com' }],
    });

    // Pruning coverage
    const history = (monitor as any).historyMap.get('https://rpc1.solana.com');
    // Add 110 items to exceed maximum limit of 100
    for (let i = 0; i < 110; i++) {
      history.push({
        timestamp: Date.now() - 10000 + i,
        latencyMs: 10,
        success: true,
      });
    }
    // Add a very old item to cover age pruning
    history.unshift({
      timestamp: Date.now() - 600000, // 10 minutes ago
      latencyMs: 50,
      success: true,
    });

    (monitor as any).pruneHistory(history);
    expect(history.length).toBeLessThanOrEqual(100);

    // Percentile boundary checks
    const valEmpty = (monitor as any).getPercentileValue([], 0.5);
    expect(valEmpty).toBe(0);

    const valSingle = (monitor as any).getPercentileValue([42], 0.95);
    expect(valSingle).toBe(42);
  });

  it('covers FallbackChain score boundary conditions', async () => {
    const monitor = new EndpointHealthMonitor({
      endpoints: [{ url: 'https://rpc-zero.solana.com', weight: 0 }],
    });
    monitor.recordRequest('https://rpc-zero.solana.com', 10, true);

    const failCallback = vi.fn();
    const fallbackChain = new FallbackChain(
      [{ url: 'https://rpc-zero.solana.com', weight: 0 }],
      monitor,
      {
        retryPolicy: {
          maxAttempts: 2,
          initialDelayMs: 5,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
          retryableErrors: ['ECONNREFUSED'],
        },
        onEndpointFail: failCallback,
      }
    );

    // Verify zero weight selection fallback
    const res = await fallbackChain.execute(async (url) => {
      return `result_from_${url}`;
    });
    expect(res).toBe('result_from_https://rpc-zero.solana.com');

    // Verify immediate throwing of non-retryable errors
    await expect(
      fallbackChain.execute(async () => {
        throw new Error('SolanaInstructionError: Custom instruction error');
      })
    ).rejects.toThrow('SolanaInstructionError');
  });

  it('covers BlockhashCache aborted queries and prefetch errors', async () => {
    const fetchBlockhash = vi.fn().mockResolvedValue({
      blockhash: 'mock_hash',
      lastValidBlockHeight: 1000n,
    });
    const getCurrentSlot = vi.fn().mockResolvedValue(100n);

    const cache = new BlockhashCache(fetchBlockhash, getCurrentSlot, {
      ttlSlots: 50,
      prefetchThresholdSlots: 40,
    });

    const controller = new AbortController();
    controller.abort();
    await expect(cache.getBlockhash('confirmed', controller.signal)).rejects.toThrow();

    // Trigger pre-fetch error coverage
    fetchBlockhash.mockRejectedValueOnce(new Error('Temporary RPC Outage'));
    // Force a near-expired cached entry to trigger background pre-fetch
    (cache as any).cache.set('confirmed', {
      blockhash: 'old_hash',
      lastValidBlockHeight: 150n,
      fetchedAtSlot: 100n,
      fetchedAtTime: Date.now(),
    });

    // Make slot estimate 120n (30 remaining < 40 prefetch threshold, > 20 expiry limit)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20 * 400); 

    const res = await cache.getBlockhash('confirmed');
    expect(res.blockhash).toBe('old_hash');
    // Clear mock
    vi.restoreAllMocks();
  });

  it('covers ConfirmationPoller error status and abort checks', async () => {
    const mockRpc = {
      getSignatureStatuses: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Generic'] }, slot: 100 }],
        }),
      }),
      getBlockHeight: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(50n),
      }),
    };

    const poller = new ConfirmationPoller(
      mockRpc as any,
      'signature' as unknown as Signature,
      200n,
      'confirmed',
      10,
      100
    );

    // Verify throws RpcError on on-chain transaction errors
    await expect(poller.confirm()).rejects.toThrow('failed on-chain');

    // Verify abort signal throws
    const controller = new AbortController();
    controller.abort();
    await expect(poller.confirm(controller.signal)).rejects.toThrow();
  });

  it('covers TransactionSender missing configuration error paths', async () => {
    const mockRpc = {
      sendTransaction: vi.fn(),
      getSignatureStatuses: vi.fn(),
      getBlockHeight: vi.fn(),
    };
    const sender = new TransactionSender(mockRpc as any);
    
    // Call without blockheight or proper tx details, should throw HelixConfigError
    await expect(
      sender.sendAndConfirm({} as any, { commitment: 'confirmed' })
    ).rejects.toThrow(HelixConfigError);
  });

  it('covers console logger outputs with and without meta', () => {
    const logger = createDefaultLogger();
    const originalLevel = process.env.HELIX_LOG_LEVEL;
    
    // Test with level = debug
    process.env.HELIX_LOG_LEVEL = 'debug';
    logger.debug('test debug', { key: 'val' });
    logger.debug('test debug no meta');
    logger.info('test info', { key: 'val' });
    logger.info('test info no meta');
    logger.warn('test warn', { key: 'val' });
    logger.warn('test warn no meta');
    logger.error('test error', { key: 'val' });
    logger.error('test error no meta');

    // Test with level = undefined / info to hit debug branch falsy
    process.env.HELIX_LOG_LEVEL = 'info';
    logger.debug('test debug silent');

    process.env.HELIX_LOG_LEVEL = originalLevel;
  });

  it('covers remaining HelixError subclasses', () => {
    const poolExh = new HelixPoolExhaustedError('pool exhausted', ['https://rpc1.solana.com']);
    expect(poolExh.endpoints).toContain('https://rpc1.solana.com');

    const txTimeout = new HelixTransactionTimeoutError('tx timeout', 'sig', 5000, 'blockhash');
    expect(txTimeout.signature).toBe('sig');
    expect(txTimeout.elapsedMs).toBe(5000);
    expect(txTimeout.blockhash).toBe('blockhash');

    const blockhashExp = new HelixBlockhashExpiredError('blockhash expired', 100n, 105n);
    expect(blockhashExp.lastValidBlockHeight).toBe(100n);
    expect(blockhashExp.currentSlot).toBe(105n);
  });

  it('covers RetryPolicy configs, abort during delay, and error.code', async () => {
    const partialPolicy = new RetryPolicy({ maxAttempts: 3 });
    expect(partialPolicy.maxAttempts).toBe(3);

    const errWithCode = new Error('Connection refused');
    (errWithCode as any).code = 'ECONNREFUSED';
    expect(partialPolicy.isRetryable(errWithCode)).toBe(true);

    const policy = new RetryPolicy({ initialDelayMs: 200, jitterFactor: 0 });
    const controller = new AbortController();
    const delayPromise = policy.executeDelay(0, controller.signal);
    setTimeout(() => {
      controller.abort(new Error('Aborted mid-way'));
    }, 50);
    await expect(delayPromise).rejects.toThrow('Aborted mid-way');
  });

  it('covers EndpointHealthMonitor check failure and empty recalculation', async () => {
    const monitor = new EndpointHealthMonitor({
      endpoints: [{ url: 'https://rpc-fail.solana.com' }],
      healthCheckIntervalMs: 10,
      healthCheckTimeoutMs: 50,
    });

    const badRpc = {
      getSlot: () => ({
        send: async () => {
          throw new Error('Connection failed');
        }
      })
    };
    (monitor as any).rpcClients.set('https://rpc-fail.solana.com', badRpc as any);

    await (monitor as any).runHealthChecks();
    const health = monitor.getHealth('https://rpc-fail.solana.com');
    expect(health?.consecutiveFailures).toBe(1);

    (monitor as any).recalculateHealthMetrics(health!, []);
  });

  it('covers FallbackChain unhealthy timeout, onExhausted, and selection boundary', async () => {
    const monitor = new EndpointHealthMonitor({
      endpoints: [{ url: 'https://rpc-unhealthy.solana.com' }],
    });
    const health = monitor.getHealth('https://rpc-unhealthy.solana.com');
    if (health) {
      health.status = 'unhealthy';
    }

    const onFallback = vi.fn();
    const onExhausted = vi.fn();
    const onEndpointFail = vi.fn();

    const fallbackChain = new FallbackChain(
      [{ url: 'https://rpc-unhealthy.solana.com' }],
      monitor,
      {
        retryPolicy: { maxAttempts: 1, initialDelayMs: 1 },
        onFallback,
        onExhausted,
        onEndpointFail,
      }
    );

    await expect(
      fallbackChain.execute(async () => {
        throw new Error('ECONNRESET');
      })
    ).rejects.toThrow(HelixPoolExhaustedError);

    expect(onExhausted).toHaveBeenCalled();
    expect(onEndpointFail).toHaveBeenCalled();

    const monitor2 = new EndpointHealthMonitor({
      endpoints: [
        { url: 'https://rpc-unhealthy-1.solana.com' },
        { url: 'https://rpc-unhealthy-2.solana.com' },
      ],
    });
    monitor2.getHealth('https://rpc-unhealthy-1.solana.com')!.status = 'unhealthy';
    monitor2.getHealth('https://rpc-unhealthy-2.solana.com')!.status = 'unhealthy';

    const fallbackChain2 = new FallbackChain(
      [
        { url: 'https://rpc-unhealthy-1.solana.com', weight: 0 },
        { url: 'https://rpc-unhealthy-2.solana.com', weight: 0 },
      ],
      monitor2,
      { retryPolicy: { maxAttempts: 1 } }
    );

    const selected = (fallbackChain2 as any).selectNextEndpoint([
      { url: 'https://rpc-unhealthy-1.solana.com', weight: 0 },
      { url: 'https://rpc-unhealthy-2.solana.com', weight: 0 },
    ]);
    expect(selected).toBeDefined();
  });

  it('covers FallbackChain unhealthy timeout abort', async () => {
    vi.useFakeTimers();

    const monitor = new EndpointHealthMonitor({
      endpoints: [{ url: 'https://rpc-unhealthy.solana.com' }],
    });
    monitor.getHealth('https://rpc-unhealthy.solana.com')!.status = 'unhealthy';

    const fallbackChain = new FallbackChain(
      [{ url: 'https://rpc-unhealthy.solana.com' }],
      monitor,
      {
        retryPolicy: { maxAttempts: 1, initialDelayMs: 1 },
      }
    );

    const executePromise = fallbackChain.execute(async (url, options) => {
      return new Promise((resolve, reject) => {
        options.abortSignal?.addEventListener('abort', () => {
          reject(options.abortSignal.reason);
        });
      });
    });

    const assertionPromise = expect(executePromise).rejects.toThrow('unhealthy fallback timeout');

    await vi.runAllTimersAsync();

    await assertionPromise;

    vi.useRealTimers();
  });

  it('covers BlockhashCache expired cache entry and aborted fetch mid-way', async () => {
    const fetchBlockhash = vi.fn().mockResolvedValue({
      blockhash: 'new_hash',
      lastValidBlockHeight: 1000n,
    });
    const getCurrentSlot = vi.fn().mockResolvedValue(100n);

    const cache = new BlockhashCache(fetchBlockhash, getCurrentSlot, {
      ttlSlots: 50,
      prefetchThresholdSlots: 40,
    });

    (cache as any).cache.set('confirmed', {
      blockhash: 'old_expired_hash',
      lastValidBlockHeight: 200n,
      fetchedAtSlot: 100n,
      fetchedAtTime: Date.now() - 60000,
    });

    const res = await cache.getBlockhash('confirmed');
    expect(res.blockhash).toBe('new_hash');
    expect(fetchBlockhash).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const fetchBlockhashAbort = vi.fn().mockImplementation(async () => {
      controller.abort(new Error('Aborted mid-way'));
      return { blockhash: 'hash', lastValidBlockHeight: 1000n };
    });

    const cache2 = new BlockhashCache(fetchBlockhashAbort, getCurrentSlot);
    await expect(cache2.getBlockhash('confirmed', controller.signal)).rejects.toThrow('Aborted mid-way');
    
    cache.clear();
  });

  it('covers ConfirmationPoller abort during delay and timeout', async () => {
    const mockRpc = {
      getSignatureStatuses: vi.fn().mockResolvedValue({ value: [null] }),
      getBlockHeight: vi.fn().mockResolvedValue(50n),
    };

    const poller = new ConfirmationPoller(
      mockRpc as any,
      'sig' as any,
      100n,
      'confirmed',
      100,
      250
    );

    await expect(poller.confirm()).rejects.toThrow(HelixTransactionTimeoutError);

    const poller2 = new ConfirmationPoller(
      mockRpc as any,
      'sig' as any,
      100n,
      'confirmed',
      5000,
      10000
    );

    const controller = new AbortController();
    const confirmPromise = poller2.confirm(controller.signal);

    setTimeout(() => {
      controller.abort(new Error('Aborted in delay'));
    }, 50);

    await expect(confirmPromise).rejects.toThrow('Aborted in delay');
  });

  it('covers TransactionSender resend failure and blockhash expiry catch', async () => {
    const mockRpc = {
      sendTransaction: vi.fn().mockReturnValue({
        send: vi.fn()
          .mockResolvedValueOnce('sig')
          .mockRejectedValueOnce(new Error('Resend failed'))
          .mockResolvedValue('sig'),
      }),
      getSignatureStatuses: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({ value: [null] }),
      }),
      getBlockHeight: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(50n),
      }),
    };

    const onRetry = vi.fn();
    const onBlockhashExpiry = vi.fn();

    const sender = new TransactionSender(
      mockRpc as any,
      {
        confirmationTimeout: 300,
        resendIntervalMs: 50,
        onRetry,
        onBlockhashExpiry,
      }
    );

    const tx = {
      lifetimeConstraint: { lastValidBlockHeight: 100n },
    };

    await expect(
      sender.sendAndConfirm(tx as any, { commitment: 'confirmed' })
    ).rejects.toThrow();

    expect(onRetry).toHaveBeenCalled();

    const mockRpcExpired = {
      sendTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue('sig'),
      }),
      getSignatureStatuses: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({ value: [null] }),
      }),
      getBlockHeight: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(200n),
      }),
    };

    const sender2 = new TransactionSender(
      mockRpcExpired as any,
      {
        confirmationTimeout: 300,
        resendIntervalMs: 50,
        onBlockhashExpiry,
      }
    );

    await expect(
      sender2.sendAndConfirm(tx as any, { commitment: 'confirmed' })
    ).rejects.toThrow(HelixBlockhashExpiredError);

    expect(onBlockhashExpiry).toHaveBeenCalled();
  });

  it('covers HelixRpcClient proxy status cases and invalid method', async () => {
    const client = createHelixClient({
      endpoints: [
        { url: 'https://rpc-1.solana.com' },
        { url: 'https://rpc-2.solana.com' },
      ],
    });

    client.monitor.getHealth('https://rpc-1.solana.com')!.status = 'unhealthy';
    client.monitor.getHealth('https://rpc-2.solana.com')!.status = 'unhealthy';

    expect(client.getHealthStatus().status).toBe('unhealthy');

    client.monitor.getHealth('https://rpc-1.solana.com')!.status = 'degraded';
    expect(client.getHealthStatus().status).toBe('degraded');

    // Spy on getClient to return a plain object so the proxy fails the function check
    vi.spyOn((client as any), 'getClient').mockReturnValue({});

    const invalidCall = () => (client as any).invalidMethodName().send();
    await expect(invalidCall()).rejects.toThrow('is not supported by @solana/web3.js');

    await client.destroy();
  });
});
