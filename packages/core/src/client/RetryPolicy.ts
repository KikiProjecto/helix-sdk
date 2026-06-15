import { RetryPolicyConfig } from '../types/index.js';

/**
 * Implements exponential backoff retry policies with jitter.
 * Supports abort signals and determines retryability of Solana RPC errors.
 */
export class RetryPolicy {
  private readonly config: Required<RetryPolicyConfig>;

  /**
   * @param config Partial configurations to override defaults.
   */
  constructor(config?: Partial<RetryPolicyConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      initialDelayMs: config?.initialDelayMs ?? 100,
      maxDelayMs: config?.maxDelayMs ?? 10000,
      backoffMultiplier: config?.backoffMultiplier ?? 2.0,
      jitterFactor: config?.jitterFactor ?? 0.25,
      retryableErrors: config?.retryableErrors ?? [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'HTTP_429',
        'HTTP_503',
        'SolanaBlockhashNotFound',
        'SolanaSlotSkipped',
      ],
    };
  }

  /**
   * Calculates the delay for a specific attempt using:
   * delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay) + jitter
   * @param attempt The current retry attempt (0-indexed).
   * @returns The calculated delay in milliseconds.
   */
  public calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
      this.config.maxDelayMs
    );
    const jitter = delay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  /**
   * Delays the execution flow for the calculated attempt delay.
   * Respects AbortSignal from the caller.
   * @param attempt The current retry attempt (0-indexed).
   * @param abortSignal Optional AbortSignal to cancel the delay.
   * @throws If aborted.
   */
  public async executeDelay(attempt: number, abortSignal?: AbortSignal): Promise<void> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    const delayMs = this.calculateDelay(attempt);
    if (delayMs <= 0) return;

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(abortSignal?.reason ?? new Error('Aborted'));
      };

      const timeoutId = setTimeout(() => {
        abortSignal?.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);

      abortSignal?.addEventListener('abort', onAbort);
    });
  }

  /**
   * Evaluates if a given error is retryable according to policy rules.
   * @param error The thrown error object, message, or unknown.
   * @returns True if retryable, false otherwise.
   */
  public isRetryable(error: unknown): boolean {
    if (!error) return false;

    let errorCode = '';
    let errorMessage = '';

    if (error instanceof Error) {
      if ('code' in error && typeof error.code === 'string') {
        errorCode = error.code;
      }
      errorMessage = error.message;
    } else if (typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      if ('code' in errObj && typeof errObj.code === 'string') {
        errorCode = errObj.code;
      }
      if ('message' in errObj && typeof errObj.message === 'string') {
        errorMessage = errObj.message;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    for (const retryable of this.config.retryableErrors) {
      if (
        errorCode === retryable ||
        errorMessage.includes(retryable) ||
        (retryable === 'HTTP_429' && (errorMessage.includes('429') || errorCode.includes('429'))) ||
        (retryable === 'HTTP_503' && (errorMessage.includes('503') || errorCode.includes('503')))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Retrieves the maximum configured attempts.
   */
  public get maxAttempts(): number {
    return this.config.maxAttempts;
  }
}
