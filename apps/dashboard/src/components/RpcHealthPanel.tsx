import React from 'react';
import { ShieldCheck, Zap, AlertTriangle } from 'lucide-react';
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

  // Latency status/progress
  const maxThreshold = 1500;
  const latencyPercentage = Math.min(100, Math.max(5, (avgP50 / maxThreshold) * 100));

  return (
    <>
      {/* 1. Latency Card */}
      <div className="glass-card p-4 flex flex-col justify-between col-span-1 hover:border-white/20 group">
        <div className="flex justify-between items-center text-[10px] font-display font-medium tracking-widest text-text-muted uppercase">
          <span>AVG P50 LATENCY</span>
          <Zap className="w-4 h-4 text-solana-purple group-hover:animate-bounce shrink-0" />
        </div>
        <div className="flex items-baseline mt-2">
          <span className="text-5xl font-mono font-bold tracking-tight text-text-primary metric-number">
            {avgP50 > 0 ? avgP50 : '--'}
          </span>
          <span className="text-lg font-mono text-text-secondary ml-1">ms</span>
        </div>
        <div className="mt-4">
          <div className="text-[11px] font-sans text-state-healthy flex items-center justify-between mb-1">
            <span>↓ 8ms from 1h ago</span>
            <span className="text-text-muted font-mono">{avgP50}/{maxThreshold}ms</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-white/5 border border-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-solana-purple transition-all duration-500 rounded-full" 
              style={{ width: `${latencyPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Uptime SLA Card */}
      <div className="glass-card p-4 flex flex-col justify-between col-span-1 hover:border-white/20 group">
        <div className="flex justify-between items-center text-[10px] font-display font-medium tracking-widest text-text-muted uppercase">
          <span>UPTIME SLA</span>
          <ShieldCheck className="w-4 h-4 text-state-healthy shrink-0" />
        </div>
        <div className="flex items-baseline mt-2">
          <span className="text-5xl font-mono font-bold tracking-tight text-text-primary metric-number">
            99.85
          </span>
          <span className="text-lg font-mono text-text-secondary ml-1">%</span>
        </div>
        <div className="mt-4">
          <div className="text-[11px] font-sans text-state-healthy flex items-center justify-between mb-1">
            <span>Target: 99.90%</span>
            <span className="text-state-healthy font-mono">● healthy</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-white/5 border border-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-state-healthy transition-all duration-500 rounded-full" 
              style={{ width: '99.85%' }}
            />
          </div>
        </div>
      </div>

      {/* 3. Dropped Transactions Card */}
      <div className="glass-card p-4 flex flex-col justify-between col-span-2 hover:border-white/20 group">
        <div className="flex justify-between items-center text-[10px] font-display font-medium tracking-widest text-text-muted uppercase">
          <span>DROPPED TXS</span>
          <AlertTriangle className={`w-4 h-4 shrink-0 ${droppedCount > 0 ? 'text-state-unhealthy animate-pulse' : 'text-text-muted'}`} />
        </div>
        <div className="flex items-baseline mt-2">
          <span className="text-5xl font-mono font-bold tracking-tight text-text-primary metric-number">
            {droppedCount}
          </span>
          <span className="text-lg font-mono text-text-secondary ml-1">txs</span>
        </div>
        <div className="mt-4">
          <div className="text-[11px] font-sans flex items-center justify-between mb-1">
            <span className="text-text-secondary">Protection: Active</span>
            <span className={`font-mono ${droppedCount > 0 ? 'text-state-unhealthy' : 'text-state-healthy'}`}>
              {droppedCount > 0 ? '⚠ DROPS DETECTED' : '✓ 100% SUCCESS'}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-white/5 border border-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${droppedCount > 0 ? 'bg-state-unhealthy' : 'bg-state-healthy'}`} 
              style={{ width: droppedCount > 0 ? '100%' : '0%' }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
