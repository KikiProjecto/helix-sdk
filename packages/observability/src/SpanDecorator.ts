import { trace, SpanStatusCode, metrics } from '@opentelemetry/api';
import { HelixRpcClient } from '@helix-sdk/core';

export class SpanDecorator {
  /**
   * Decorates a HelixRpcClient to automatically record OTel spans, requests count, errors, and latency.
   * @param client The HelixRpcClient instance.
   * @returns The decorated client.
   */
  public static decorate(client: HelixRpcClient): HelixRpcClient {
    const tracer = trace.getTracer('helix-sdk');
    const meter = metrics.getMeter('helix-sdk');

    const latencyHistogram = meter.createHistogram('helix.rpc.latency_ms', {
      description: 'Per-endpoint per-method latency',
      unit: 'ms',
    });
    const requestsCounter = meter.createCounter('helix.rpc.requests_total', {
      description: 'Total RPC calls',
    });
    const errorsCounter = meter.createCounter('helix.rpc.errors_total', {
      description: 'Errors by code',
    });

    return new Proxy(client, {
      get(target, prop, receiver) {
        const originalValue = Reflect.get(target, prop, receiver);

        if (typeof originalValue === 'function') {
          return (...args: any[]) => {
            const method = String(prop);
            
            // Skip tracing custom extensions that aren't RPC methods
            if (
              prop === 'destroy' ||
              prop === 'getHealthStatus' ||
              prop === 'getMetrics' ||
              prop === 'sendAndConfirmTransaction'
            ) {
              return originalValue.apply(target, args);
            }

            const result = originalValue.apply(target, args);
            if (result && typeof result === 'object' && 'send' in result) {
              const originalSend = result.send;
              result.send = async (options?: any) => {
                const startTime = Date.now();
                requestsCounter.add(1, { method });
                
                return tracer.startActiveSpan(`helix.rpc.call`, {
                  attributes: {
                    'rpc.system': 'solana',
                    'rpc.method': method,
                  }
                }, async (span) => {
                  try {
                    const res = await originalSend.call(result, options);
                    const latency = Date.now() - startTime;
                    latencyHistogram.record(latency, { method, status: 'success' });
                    span.setStatus({ code: SpanStatusCode.OK });
                    span.end();
                    return res;
                  } catch (err: any) {
                    const latency = Date.now() - startTime;
                    latencyHistogram.record(latency, { method, status: 'error' });
                    errorsCounter.add(1, { method, error_code: err.code || 'unknown' });
                    span.setStatus({
                      code: SpanStatusCode.ERROR,
                      message: err.message || String(err),
                    });
                    span.recordException(err);
                    span.end();
                    throw err;
                  }
                });
              };
            }
            return result;
          };
        }

        return originalValue;
      }
    });
  }
}
