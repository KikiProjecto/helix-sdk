import { RetryPolicy } from '../client/RetryPolicy.js';
import { HelixPoolExhaustedError } from '../errors/HelixErrors.js';
import {
  EndpointConfig,
  FallbackChainConfig,
  HelixLogger,
} from '../types/index.js';
import { createNoopLogger } from '../utils/logger.js';
import { EndpointHealthMonitor } from './EndpointHealthMonitor.js';

/**
 * Manages executing RPC calls against a pool of endpoints.
 * Automatically handles weighted routing, failovers, retries, and error tracking.
 */
export class FallbackChain {
  private readonly endpoints: readonly EndpointConfig[];
  private readonly monitor: EndpointHealthMonitor;
  private readonly retryPolicy: RetryPolicy;
  private readonly config: FallbackChainConfig;
  private readonly logger: HelixLogger;

  /**
   * @param endpoints The configuration list of endpoints.
   * @param monitor The active EndpointHealthMonitor.
   * @param config Retry and callback configuration.
   * @param logger Pluggable logger.
   */
  constructor(
    endpoints: readonly EndpointConfig[],
    monitor: EndpointHealthMonitor,
    config: FallbackChainConfig,
    logger?: HelixLogger
  ) {
    this.endpoints = endpoints;
    this.monitor = monitor;
    this.config = config;
    this.retryPolicy = new RetryPolicy(config.retryPolicy);
    this.logger = logger ?? createNoopLogger();
  }

  /**
   * Executes an operation against the endpoint pool, applying routing, retry, and failover logic.
   * @param operation The async task to run on a selected endpoint URL.
   * @param abortSignal Optional abort signal to cancel execution.
   * @returns The result of the operation.
   * @throws {HelixPoolExhaustedError} If all endpoints failed or max attempts are reached.
   */
  public async execute<T>(
    operation: (endpoint: string, options: { abortSignal?: AbortSignal }) => Promise<T>,
    abortSignal?: AbortSignal
  ): Promise<T> {
    const untried = [...this.endpoints];
    let attempt = 0;
    let lastError: Error | null = null;
    let currentEndpointUrl: string | null = null;

    while (untried.length > 0 && attempt < this.retryPolicy.maxAttempts) {
      if (abortSignal?.aborted) {
        throw abortSignal.reason ?? new Error('Aborted');
      }

      // Select next endpoint based on health state & weights
      const selectedEp = this.selectNextEndpoint(untried);
      const url = selectedEp.url;

      // Remove from untried list for the current request context
      const idx = untried.findIndex((e) => e.url === url);
      if (idx !== -1) {
        untried.splice(idx, 1);
      }

      // Emit fallback events if switching endpoints
      if (currentEndpointUrl && currentEndpointUrl !== url) {
        this.logger.warn(`Failover triggered from ${currentEndpointUrl} to ${url}`);
        this.config.onFallback?.(currentEndpointUrl, url);
      }
      currentEndpointUrl = url;

      const health = this.monitor.getHealth(url);
      const isUnhealthy = health?.status === 'unhealthy';
      // If unhealthy, impose a short 2s timeout as a quick probe attempt
      const timeoutMs = isUnhealthy ? 2000 : undefined;

      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | undefined;

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          controller.abort(
            new Error(`Endpoint ${url} failed to respond within ${timeoutMs}ms (unhealthy fallback timeout)`)
          );
        }, timeoutMs);
      }

      // Link caller's abort signal
      let onAbort: (() => void) | undefined;
      if (abortSignal) {
        onAbort = () => {
          controller.abort(abortSignal.reason);
        };
        abortSignal.addEventListener('abort', onAbort);
      }

      const start = Date.now();
      try {
        const result = await operation(url, { abortSignal: controller.signal });
        const latency = Date.now() - start;
        this.monitor.recordRequest(url, latency, true);
        return result;
      } catch (err) {
        const latency = Date.now() - start;
        this.monitor.recordRequest(url, latency, false);

        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        this.logger.warn(`Request failed on endpoint ${url}: ${error.message}`);
        this.config.onEndpointFail?.(url, error);

        if (!this.retryPolicy.isRetryable(error)) {
          // Throw non-retryable errors immediately
          throw error;
        }

        attempt++;

        // Delay retry
        if (untried.length > 0 && attempt < this.retryPolicy.maxAttempts) {
          await this.retryPolicy.executeDelay(attempt, abortSignal);
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      }
    }

    const exhaustedErr = new HelixPoolExhaustedError(
      `All ${this.endpoints.length} endpoints failed or retry limit reached`,
      this.endpoints.map((e) => e.url),
      { attempts: attempt },
      lastError ?? undefined
    );
    this.config.onExhausted?.(attempt, exhaustedErr);
    throw exhaustedErr;
  }

  /**
   * Selects the next endpoint to try from untried list.
   * Prefers healthy -> degraded -> unhealthy (as last resort).
   * Inside each tier, applies scoring formula: score = weight * health_multiplier / (latencyP50 + 1)
   */
  private selectNextEndpoint(untried: EndpointConfig[]): EndpointConfig {
    const healths = untried.map((ep) => {
      const h = this.monitor.getHealth(ep.url);
      return {
        ep,
        status: h?.status ?? 'healthy',
        latencyP50: h?.latencyP50Ms ?? 0,
        priority: ep.priority ?? 1.0,
      };
    });

    let eligible = healths.filter((h) => h.status === 'healthy');
    if (eligible.length === 0) {
      eligible = healths.filter((h) => h.status === 'degraded');
    }
    if (eligible.length === 0) {
      eligible = healths; // last resort: try all remaining (including unhealthy)
    }

    if (eligible.length === 0) {
      throw new Error('No endpoints available in pool selection');
    }

    // Filter by priority: find minimum priority number and restrict to candidates matching it
    const minPriority = Math.min(...eligible.map((item) => item.priority));
    const priorityCandidates = eligible.filter((item) => item.priority === minPriority);

    const scored = priorityCandidates.map((item) => {
      const weight = item.ep.weight ?? 1.0;
      let multiplier = 1.0;
      if (item.status === 'degraded') {
        multiplier = 0.3;
      } else if (item.status === 'unhealthy') {
        multiplier = 0.05;
      }
      const score = (weight * multiplier) / (item.latencyP50 + 1);
      return { ...item, score };
    });

    const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
    if (totalScore <= 0) {
      // Uniform random fallback if all scores are zero
      const index = Math.floor(Math.random() * scored.length);
      return (scored[index] ?? scored[0])!.ep;
    }

    let r = Math.random() * totalScore;
    for (const item of scored) {
      r -= item.score;
      if (r <= 0) {
        return item.ep;
      }
    }

    return scored[scored.length - 1]!.ep;
  }
}
