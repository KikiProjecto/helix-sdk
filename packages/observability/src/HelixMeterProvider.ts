import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { metrics } from '@opentelemetry/api';
import { DatadogExporter } from './exporters/DatadogExporter.js';

export class HelixMeterProvider {
  private provider: MeterProvider | null = null;
  private readers: PeriodicExportingMetricReader[] = [];

  constructor(
    private readonly config: {
      serviceName: string;
      datadog?: {
        enabled: boolean;
        apiKey: string;
        site?: string;
        service?: string;
        env?: string;
        tags?: Record<string, string>;
        exportIntervalMs?: number;
      };
    }
  ) {}

  /**
   * Initializes the global OTel MeterProvider and registers configure readers/exporters.
   */
  public start(): void {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: this.config.serviceName,
    });

    const metricReaders: PeriodicExportingMetricReader[] = [];

    if (this.config.datadog?.enabled && this.config.datadog.apiKey) {
      const ddExporter = new DatadogExporter(this.config.datadog);
      const reader = new PeriodicExportingMetricReader({
        exporter: ddExporter,
        exportIntervalMillis: this.config.datadog.exportIntervalMs ?? 10000,
      });
      metricReaders.push(reader);
      this.readers.push(reader);
    }

    this.provider = new MeterProvider({
      resource,
      readers: metricReaders,
    });

    metrics.setGlobalMeterProvider(this.provider);
  }

  /**
   * Shuts down the provider.
   */
  public async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
    }
  }
}
