import { PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';

export enum ExportResultCode {
  SUCCESS = 0,
  FAILED = 1,
}

export interface ExportResult {
  code: ExportResultCode;
  error?: Error;
}

export class DatadogExporter implements PushMetricExporter {
  constructor(
    private readonly config: {
      apiKey: string;
      site?: string;
      service?: string;
      env?: string;
      tags?: Record<string, string>;
    }
  ) {}

  public export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void {
    const site = this.config.site ?? 'datadoghq.com';
    const url = `https://api.${site}/api/v1/series`;

    const series: any[] = [];
    const timestamp = Math.floor(Date.now() / 1000);

    for (const scopeMetric of metrics.scopeMetrics) {
      for (const metric of scopeMetric.metrics) {
        const name = metric.descriptor.name;
        
        for (const dp of metric.dataPoints) {
          const value = dp.value;
          const tags: string[] = [];
          if (this.config.service) tags.push(`service:${this.config.service}`);
          if (this.config.env) tags.push(`env:${this.config.env}`);
          if (this.config.tags) {
            for (const [k, v] of Object.entries(this.config.tags)) {
              tags.push(`${k}:${v}`);
            }
          }
          for (const [k, v] of Object.entries(dp.attributes)) {
            tags.push(`${k}:${v}`);
          }

          series.push({
            metric: name,
            points: [[timestamp, Number(value)]],
            type: 'gauge',
            tags,
          });
        }
      }
    }

    if (series.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    fetch(`${url}?api_key=${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series }),
    })
      .then((res) => {
        if (res.ok) {
          resultCallback({ code: ExportResultCode.SUCCESS });
        } else {
          resultCallback({
            code: ExportResultCode.FAILED,
            error: new Error(`Datadog API returned status ${res.status}`),
          });
        }
      })
      .catch((err) => {
        resultCallback({ code: ExportResultCode.FAILED, error: err });
      });
  }

  public async shutdown(): Promise<void> {}
  public async forceFlush(): Promise<void> {}
}
