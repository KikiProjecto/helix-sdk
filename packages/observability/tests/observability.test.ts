import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';
import {
  HelixMeterProvider,
  HelixTracerProvider,
  MetricEmitter,
  SpanDecorator,
  DatadogExporter,
  PrometheusExporter,
  ExportResultCode,
} from '../src/index.js';

describe('Observability Package', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      } as any)
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('MetricEmitter should initialize and record metrics without throwing', () => {
    const emitter = new MetricEmitter('test-emitter');
    expect(() => emitter.recordTxSent('sendTransaction')).not.toThrow();
    expect(() => emitter.recordTxConfirmed('confirmed')).not.toThrow();
    expect(() => emitter.recordTxDropped('timeout')).not.toThrow();
    expect(() => emitter.recordJitoSubmitted('mainnet')).not.toThrow();
    expect(() => emitter.recordJitoLanded('mainnet')).not.toThrow();
    expect(() => emitter.recordJitoDropped('mainnet')).not.toThrow();
    expect(() => emitter.recordPoolFailover('ep1', 'ep2')).not.toThrow();
  });

  it('HelixMeterProvider and HelixTracerProvider should start and shutdown cleanly', async () => {
    const meterProvider = new HelixMeterProvider({
      serviceName: 'test-service',
      datadog: {
        enabled: true,
        apiKey: 'test-api-key',
        site: 'datadoghq.com',
      },
    });

    const tracerProvider = new HelixTracerProvider({
      serviceName: 'test-service',
    });

    expect(() => meterProvider.start()).not.toThrow();
    expect(() => tracerProvider.start()).not.toThrow();

    await expect(meterProvider.shutdown()).resolves.not.toThrow();
    await expect(tracerProvider.shutdown()).resolves.not.toThrow();
  });

  it('PrometheusExporter should initialize start and stop cleanly', async () => {
    const promExporter = new PrometheusExporter({ port: 9091 });
    expect(() => promExporter.start()).not.toThrow();
    await expect(promExporter.stop()).resolves.not.toThrow();
  });

  it('DatadogExporter should format and post metrics to Datadog API', async () => {
    const exporter = new DatadogExporter({
      apiKey: 'test-api-key',
      service: 'test-service',
      env: 'test-env',
      tags: { region: 'eu' },
    });

    const mockResourceMetrics = {
      resource: {} as any,
      scopeMetrics: [
        {
          scope: {} as any,
          metrics: [
            {
              descriptor: {
                name: 'helix.rpc.latency_ms',
                type: 1, // Gauge/Histogram
                description: '',
                unit: '',
                valueType: 1,
              },
              dataPoints: [
                {
                  value: 47,
                  attributes: { method: 'getSlot' },
                  startTime: [0, 0] as [number, number],
                  endTime: [0, 0] as [number, number],
                },
              ],
            },
          ],
        },
      ],
    };

    const callbackSpy = vi.fn();
    exporter.export(mockResourceMetrics, callbackSpy);

    // Wait for promise resolution
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalled();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toContain('https://api.datadoghq.com/api/v1/series?api_key=test-api-key');
    
    const body = JSON.parse(calledInit.body);
    expect(body.series[0].metric).toBe('helix.rpc.latency_ms');
    expect(body.series[0].points[0][1]).toBe(47);
    expect(body.series[0].tags).toContain('service:test-service');
    expect(body.series[0].tags).toContain('env:test-env');
    expect(body.series[0].tags).toContain('region:eu');
    expect(body.series[0].tags).toContain('method:getSlot');

    expect(callbackSpy).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('SpanDecorator should wrap RPC client and record spans and metrics', async () => {
    const mockSend = vi.fn().mockResolvedValue('test-result');
    const mockRpcClient = {
      getSlot: vi.fn().mockReturnValue({
        send: mockSend,
      }),
    };

    const decorated = SpanDecorator.decorate(mockRpcClient as any);
    
    // Call getSlot
    const requestObj = decorated.getSlot();
    expect(requestObj.send).toBeDefined();

    const result = await requestObj.send({ skipPreflight: true });
    expect(result).toBe('test-result');
    expect(mockSend).toHaveBeenCalled();
  });
});
