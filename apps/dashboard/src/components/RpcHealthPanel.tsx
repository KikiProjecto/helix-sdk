import React from 'react';
import { ShieldCheck, Zap, Activity } from 'lucide-react';
import { EndpointMetric, TransactionMetric } from '@/hooks/useMetricsSocket';

interface RpcHealthPanelProps {
  endpoints: EndpointMetric[];
  transactions: TransactionMetric[];
}

export function RpcHealthPanel({ endpoints, transactions }: RpcHealthPanelProps) {
  // Compute P50 overall
  const p50s = endpoints.map((e) => e.status === 'healthy' ? e.latencyP50Ms : 0).filter(Boolean);
  const avgP50 = p50s.length > 0 ? Math.round(p50s.reduce((a, b) => a + b, 0) / p50s.length) : 0;
  
  // Count dropped transactions
  const droppedCount = transactions.filter((t) => t.status === 'dropped').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Uptime Card */}
      <div className="bg-surface-1 border border-border-default rounded-lg p-5 flex flex-col justify-between h-[120px] transition-all hover:border-border-strong">
        <div className="flex justify-between items-center text-xs font-display uppercase tracking-wider text-text-muted">
          <span>UPTIME SLA</span>
          <ShieldCheck className="w-4 h-4 text-state-healthy" />
        </div>
        <div className="text-3xl font-mono font-semibold text-text-primary mt-2">
          99.85%
        </div>
        <div className="text-xs text-text-secondary mt-1 flex items-center justify-between">
          <span>Target: 99.9%</span>
          <span className="text-state-healthy">● healthy</span>
        </div>
      </div>

      {/* Latency Card */}
      <div className="bg-surface-1 border border-border-default rounded-lg p-5 flex flex-col justify-between h-[120px] transition-all hover:border-border-strong">
        <div className="flex justify-between items-center text-xs font-display uppercase tracking-wider text-text-muted">
          <span>AVG P50 LATENCY</span>
          <Zap className="w-4 h-4 text-solana-purple" />
        </div>
        <div className="text-3xl font-mono font-semibold text-text-primary mt-2">
          {avgP50 > 0 ? `${avgP50} ms` : '--'}
        </div>
        <div className="text-xs text-text-secondary mt-1 flex items-center justify-between">
          <span>Threshold: 1,500ms</span>
          <span className="text-solana-green">↓ 8ms from 1h ago</span>
        </div>
      </div>

      {/* Dropped Txs Card */}
      <div className="bg-surface-1 border border-border-default rounded-lg p-5 flex flex-col justify-between h-[120px] transition-all hover:border-border-strong">
        <div className="flex justify-between items-center text-xs font-display uppercase tracking-wider text-text-muted">
          <span>DROPPED TRANSACTIONS</span>
          <Activity className="w-4 h-4 text-state-unhealthy" />
        </div>
        <div className="text-3xl font-mono font-semibold text-text-primary mt-2">
          {droppedCount}
        </div>
        <div className="text-xs text-text-secondary mt-1 flex items-center justify-between">
          <span>Helix Protection: Active</span>
          <span className={droppedCount > 0 ? 'text-state-unhealthy' : 'text-state-healthy'}>
            {droppedCount > 0 ? '⚠ DROPS DETECTED' : '✓ 100% SUCCESS'}
          </span>
        </div>
      </div>
    </div>
  );
}
