import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export class HelixTracerProvider {
  private provider: NodeTracerProvider | null = null;

  constructor(
    private readonly config: {
      serviceName: string;
    }
  ) {}

  /**
   * Initializes and registers the global tracer provider.
   */
  public start(): void {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: this.config.serviceName,
    });

    this.provider = new NodeTracerProvider({
      resource,
    });

    this.provider.register();
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
