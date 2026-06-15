import { Blockhash, Commitment } from '@solana/web3.js';

export interface HelixLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface EndpointConfig {
  url: string;
  wsUrl?: string;
  weight?: number;                        // default: 1.0
  priority?: number;                      // lower = tried first
  rateLimitRps?: number;                  // requests per second ceiling
  tags?: readonly string[];               // e.g. ['mainnet', 'staked']
}

export interface RpcPoolConfig {
  endpoints: readonly EndpointConfig[];
  healthCheckIntervalMs?: number;         // default: 5000
  healthCheckTimeoutMs?: number;          // default: 2000
  degradedLatencyThresholdMs?: number;    // default: 1500
  unhealthyErrorRateThreshold?: number;   // default: 0.2 (20%)
  maxConcurrentRequests?: number;         // default: 10 per endpoint
  logger?: HelixLogger;
}

export interface EndpointHealth {
  url: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  errorRate1m: number;
  successRate1m: number;
  lastCheckAt: Date;
  consecutiveFailures: number;
}

export interface RetryPolicyConfig {
  maxAttempts: number;              // default: 5
  initialDelayMs: number;           // default: 100
  maxDelayMs: number;               // default: 10_000
  backoffMultiplier: number;        // default: 2.0
  jitterFactor: number;             // default: 0.25 (adds ±25% jitter)
  retryableErrors: readonly string[];  // error codes that trigger retry
}

export interface FallbackChainConfig {
  retryPolicy: RetryPolicyConfig;
  onEndpointFail?: (endpoint: string, error: Error) => void;
  onFallback?: (from: string, to: string) => void;
  onExhausted?: (attempts: number, lastError: Error) => void;
}

export interface BlockhashWithExpiryBlockHeight {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}

export interface MetricsSnapshot {
  timestamp: number;
  endpoints: EndpointHealth[];
  healthyNodes: number;
  degradedNodes: number;
  unhealthyNodes: number;
  totalRequests: number;
  totalErrors: number;
}

export interface BlockhashCacheConfig {
  ttlSlots?: number;                    // default: 100
  prefetchThresholdSlots?: number;      // default: 50
  commitment?: Commitment;              // default: 'confirmed'
}

