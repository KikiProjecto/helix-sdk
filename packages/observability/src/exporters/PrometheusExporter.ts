import { PrometheusExporter as OTelPrometheusExporter } from '@opentelemetry/exporter-prometheus';

export class PrometheusExporter {
  private exporter: OTelPrometheusExporter | null = null;

  constructor(private readonly config: { port?: number; path?: string } = {}) {}

  /**
   * Starts the Prometheus metric scrape HTTP server.
   */
  public start(): void {
    const port = this.config.port ?? 9090;
    this.exporter = new OTelPrometheusExporter({
      port,
    });
  }

  /**
   * Stops the Prometheus scrape HTTP server.
   */
  public async stop(): Promise<void> {
    if (this.exporter) {
      await this.exporter.stopServer();
    }
  }
}
