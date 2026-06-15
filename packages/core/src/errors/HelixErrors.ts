/**
 * Base error class for all Helix SDK errors.
 * Provides standard fields for error code, context, and underlying cause.
 */
export class HelixError extends Error {
  /**
   * @param message Human-readable error message.
   * @param code Machine-readable error code.
   * @param context Additional metadata context related to the error.
   * @param cause The underlying error or cause of this error.
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain for custom errors
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an individual RPC endpoint fails.
 */
export class HelixRpcError extends HelixError {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly method: string,
    public readonly attempt: number,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'RPC_ERROR', { endpoint, method, attempt, ...context }, cause);
  }
}

/**
 * Thrown when all available RPC endpoints in the pool have been exhausted.
 */
export class HelixPoolExhaustedError extends HelixError {
  constructor(
    message: string,
    public readonly endpoints: readonly string[],
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'POOL_EXHAUSTED', { endpoints, ...context }, cause);
  }
}

/**
 * Thrown when a transaction is detected as dropped.
 */
export class HelixTransactionDroppedError extends HelixError {
  constructor(
    message: string,
    public readonly signature: string,
    public readonly slot?: number,
    public readonly reason?: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'TRANSACTION_DROPPED', { signature, slot, reason, ...context }, cause);
  }
}

/**
 * Thrown when transaction confirmation times out.
 */
export class HelixTransactionTimeoutError extends HelixError {
  constructor(
    message: string,
    public readonly signature: string,
    public readonly elapsedMs: number,
    public readonly blockhash?: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'TRANSACTION_TIMEOUT', { signature, elapsedMs, blockhash, ...context }, cause);
  }
}

/**
 * Thrown when a blockhash used for a transaction is expired.
 */
export class HelixBlockhashExpiredError extends HelixError {
  constructor(
    message: string,
    public readonly lastValidBlockHeight: bigint,
    public readonly currentSlot: bigint,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'BLOCKHASH_EXPIRED', { lastValidBlockHeight, currentSlot, ...context }, cause);
  }
}

/**
 * Thrown when a Jito bundle is rejected or drops.
 */
export class HelixJitoBundleRejectedError extends HelixError {
  constructor(
    message: string,
    public readonly bundleId: string,
    public readonly reason: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'JITO_BUNDLE_REJECTED', { bundleId, reason, ...context }, cause);
  }
}

/**
 * Thrown when dynamic priority fee estimation fails.
 */
export class HelixFeeEstimationError extends HelixError {
  constructor(
    message: string,
    public readonly source: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'FEE_ESTIMATION_ERROR', { source, ...context }, cause);
  }
}

/**
 * Thrown when there is an invalid configuration parameter.
 */
export class HelixConfigError extends HelixError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly reason: string,
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message, 'CONFIG_ERROR', { field, value, reason, ...context }, cause);
  }
}
