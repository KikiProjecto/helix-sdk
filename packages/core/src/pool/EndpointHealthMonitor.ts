import { createSolanaRpc } from '@solana/web3.js';

import { HelixConfigError } from '../errors/HelixErrors.js';
import {
  EndpointConfig,
  EndpointHealth,
  HelixLogger,
  RpcPoolConfig,
} from '../types/index.js';
import { createNoopLogger } from '../utils/logger.js';

interface CheckRecord {
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

/**
 * Monitors the health and latency of a pool of Solana RPC endpoints.
 * Handles active background pinging (getSlot) and passive request tracking.
 */
export class EndpointHealthMonitor {
  private readonly config: Required<Omit<RpcPoolConfig, 'logger'>> & { logger: HelixLogger };
  private readonly endpoints: readonly EndpointConfig[];
  private readonly healthMap = new Map<string, EndpointHealth>();
  private readonly historyMap = new Map<string, CheckRecord[]>();
  private readonly rpcClients = new Map<string, ReturnType<typeof createSolanaRpc>>();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly logger: HelixLogger;
  private totalRequests = 0;
  private totalErrors = 0;

  /**
   * @param config Configuration for the pool health monitor.
   * @throws {HelixConfigError} If config parameters are invalid.
   */
  constructor(config: RpcPoolConfig) {
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new HelixConfigError(
        'Invalid pool configuration',
        'endpoints',
        config.endpoints,
        'At least one endpoint must be specified'
      );
    }

    this.logger = config.logger ?? createNoopLogger();
    this.endpoints = config.endpoints;

    this.config = {
      endpoints: config.endpoints,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 5000,
      healthCheckTimeoutMs: config.healthCheckTimeoutMs ?? 2000,
      degradedLatencyThresholdMs: config.degradedLatencyThresholdMs ?? 1500,
      unhealthyErrorRateThreshold: config.unhealthyErrorRateThreshold ?? 0.2,
      maxConcurrentRequests: config.maxConcurrentRequests ?? 10,
      logger: this.logger,
    };

    // Initialize state map for all endpoints
    for (const ep of this.endpoints) {
      this.healthMap.set(ep.url, {
        url: ep.url,
        status: 'healthy',
        latencyP50Ms: 0,
        latencyP95Ms: 0,
        latencyP99Ms: 0,
        errorRate1m: 0,
        successRate1m: 1,
        lastCheckAt: new Date(),
        consecutiveFailures: 0,
      });
      this.historyMap.set(ep.url, []);
      this.rpcClients.set(ep.url, createSolanaRpc(ep.url));
    }
  }

  /**
   * Starts the active health check background loop.
   */
  public start(): void {
    if (this.intervalId) return;
    if (this.config.healthCheckIntervalMs <= 0) {
      this.logger.debug('Health monitor background checks disabled (interval <= 0)');
      return;
    }

    this.logger.debug('Starting health monitor background checks');
    // Run initial check immediately
    this.runHealthChecks().catch((err) => {
      this.logger.error('Error running initial health checks', { error: String(err) });
    });

    this.intervalId = setInterval(() => {
      this.runHealthChecks().catch((err) => {
        this.logger.error('Error running health checks', { error: String(err) });
      });
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stops the active health check background loop.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.debug('Stopped health monitor background checks');
    }
  }

  /**
   * Retrieves the health snapshot of a specific endpoint.
   * @param url The endpoint URL.
   * @returns The health snapshot of the endpoint, or undefined if not found.
   */
  public getHealth(url: string): EndpointHealth | undefined {
    return this.healthMap.get(url);
  }

  /**
   * Retrieves health snapshots for all monitored endpoints.
   * @returns An array of all endpoint health snapshots.
   */
  public getAllHealth(): EndpointHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Registers a passive result of an RPC request made to an endpoint.
   * Allows real-time health updates between active background checks.
   * @param url The endpoint URL.
   * @param latencyMs The latency of the request in milliseconds.
   * @param success Whether the request was successful.
   */
  public recordRequest(url: string, latencyMs: number, success: boolean): void {
    this.totalRequests++;
    if (!success) {
      this.totalErrors++;
    }

    const history = this.historyMap.get(url);
    const health = this.healthMap.get(url);

    if (!history || !health) return;

    const record: CheckRecord = {
      timestamp: Date.now(),
      latencyMs,
      success,
    };

    history.push(record);
    this.pruneHistory(history);

    if (success) {
      health.consecutiveFailures = 0;
    } else {
      health.consecutiveFailures += 1;
    }

    this.recalculateHealthMetrics(health, history);
    this.logger.debug(`Recorded request for ${url}: latency=${latencyMs}ms, success=${success}, status=${health.status}`);
  }

  /**
   * Returns the total number of RPC requests recorded since startup.
   */
  public getTotalRequests(): number {
    return this.totalRequests;
  }

  /**
   * Returns the total number of RPC errors recorded since startup.
   */
  public getTotalErrors(): number {
    return this.totalErrors;
  }

  /**
   * Runs getSlot query against all endpoints to update health state.
   */
  private async runHealthChecks(): Promise<void> {
    const promises = this.endpoints.map(async (ep) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.healthCheckTimeoutMs);

      const start = Date.now();
      let success = false;
      let latencyMs = 0;

      try {
        const rpc = this.rpcClients.get(ep.url);
        if (!rpc) throw new Error('RPC client not initialized');

        // Execute getSlot query with abort signal
        await rpc.getSlot().send({ abortSignal: controller.signal });
        latencyMs = Date.now() - start;
        success = true;
      } catch (err) {
        latencyMs = Date.now() - start;
        this.logger.debug(`Health check failed for ${ep.url}`, { error: String(err), latencyMs });
      } finally {
        clearTimeout(timeoutId);
      }

      this.recordRequest(ep.url, latencyMs, success);
    });

    await Promise.all(promises);
  }

  /**
   * Recalculates metrics (P50/P95/P99 latency, error rate) and updates health status.
   */
  private recalculateHealthMetrics(health: EndpointHealth, history: CheckRecord[]): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Filter checks in the last minute
    const recentChecks = history.filter((c) => c.timestamp >= oneMinuteAgo);

    if (recentChecks.length === 0) {
      return; // Not enough data to update
    }

    const totalRequests = recentChecks.length;
    const totalErrors = recentChecks.filter((c) => !c.success).length;

    health.errorRate1m = totalErrors / totalRequests;
    health.successRate1m = 1 - health.errorRate1m;
    health.lastCheckAt = new Date();

    // Calculate latency percentiles from successful requests in history
    const successfulLatencies = history
      .filter((c) => c.success)
      .map((c) => c.latencyMs)
      .sort((a, b) => a - b);

    if (successfulLatencies.length > 0) {
      health.latencyP50Ms = this.getPercentileValue(successfulLatencies, 0.50);
      health.latencyP95Ms = this.getPercentileValue(successfulLatencies, 0.95);
      health.latencyP99Ms = this.getPercentileValue(successfulLatencies, 0.99);
    }

    // Determine state
    // Consecutive failures >= 3 or 1-minute error rate >= threshold means unhealthy
    if (health.consecutiveFailures >= 3 || health.errorRate1m >= this.config.unhealthyErrorRateThreshold) {
      health.status = 'unhealthy';
    } else if (health.latencyP50Ms > this.config.degradedLatencyThresholdMs) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }
  }

  /**
   * Helper to retrieve percentile value from sorted numeric array.
   */
  private getPercentileValue(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.floor(sortedArray.length * percentile);
    // Safe bounds check
    const clampedIndex = Math.min(Math.max(index, 0), sortedArray.length - 1);
    return sortedArray[clampedIndex] ?? 0;
  }

  /**
   * Keeps history array size under 100 items and trims elements older than 5 minutes.
   */
  private pruneHistory(history: CheckRecord[]): void {
    const fiveMinutesAgo = Date.now() - 300000;
    
    // Filter out old records first
    let startIndex = 0;
    while (startIndex < history.length && (history[startIndex]?.timestamp ?? 0) < fiveMinutesAgo) {
      startIndex++;
    }
    if (startIndex > 0) {
      history.splice(0, startIndex);
    }

    // Hard limit on length
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }
}
