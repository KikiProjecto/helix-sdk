import { metrics, Meter, Counter } from '@opentelemetry/api';

export class MetricEmitter {
  private readonly meter: Meter;
  private readonly txSentCounter: Counter;
  private readonly txConfirmedCounter: Counter;
  private readonly txDroppedCounter: Counter;
  private readonly jitoSubmittedCounter: Counter;
  private readonly jitoLandedCounter: Counter;
  private readonly jitoDroppedCounter: Counter;
  private readonly poolFailoverCounter: Counter;

  constructor(meterName = 'helix-sdk') {
    this.meter = metrics.getMeter(meterName);

    this.txSentCounter = this.meter.createCounter('helix.tx.sent_total', {
      description: 'Total transactions sent',
    });
    this.txConfirmedCounter = this.meter.createCounter('helix.tx.confirmed_total', {
      description: 'Confirmed by commitment level',
    });
    this.txDroppedCounter = this.meter.createCounter('helix.tx.dropped_total', {
      description: 'Dropped transactions',
    });
    this.jitoSubmittedCounter = this.meter.createCounter('helix.jito.bundle_submitted', {
      description: 'Jito bundles submitted',
    });
    this.jitoLandedCounter = this.meter.createCounter('helix.jito.bundle_landed', {
      description: 'Jito bundles confirmed',
    });
    this.jitoDroppedCounter = this.meter.createCounter('helix.jito.bundle_dropped', {
      description: 'Jito bundles dropped',
    });
    this.poolFailoverCounter = this.meter.createCounter('helix.pool.failover_total', {
      description: 'Pool failover events',
    });
  }

  public recordTxSent(method: string): void {
    this.txSentCounter.add(1, { method });
  }

  public recordTxConfirmed(commitment: string): void {
    this.txConfirmedCounter.add(1, { commitment });
  }

  public recordTxDropped(reason: string): void {
    this.txDroppedCounter.add(1, { reason });
  }

  public recordJitoSubmitted(endpoint: string): void {
    this.jitoSubmittedCounter.add(1, { endpoint });
  }

  public recordJitoLanded(endpoint: string): void {
    this.jitoLandedCounter.add(1, { endpoint });
  }

  public recordJitoDropped(endpoint: string): void {
    this.jitoDroppedCounter.add(1, { endpoint });
  }

  public recordPoolFailover(from: string, to: string): void {
    this.poolFailoverCounter.add(1, { from, to });
  }
}
