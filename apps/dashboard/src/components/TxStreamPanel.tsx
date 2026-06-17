'use client';

import React from 'react';
import { TransactionMetric } from '@/hooks/useMetricsSocket';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface TxStreamPanelProps {
  transactions: TransactionMetric[];
}

export function TxStreamPanel({ transactions }: TxStreamPanelProps) {
  const confirmedCount = transactions.filter((t) => t.status === 'confirmed').length;
  const retriedCount = transactions.filter((t) => t.status === 'retried').length;
  const droppedCount = transactions.filter((t) => t.status === 'dropped').length;

  return (
    <div className="glass-card flex flex-col h-full col-span-12 xl:col-span-4 xl:row-span-8 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] flex justify-between items-center bg-black/20 select-none">
        <h2 className="font-display font-semibold text-[14px] tracking-wider text-text-primary">TRANSACTION FEED</h2>
        <span className="text-[10px] font-mono text-text-muted flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-solana-purple" />
          LIVE STREAM
        </span>
      </div>

      {/* Transaction Feed List */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] p-4 flex flex-col gap-2 bg-black/10 min-h-[300px]">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted select-none">
            <RefreshCw className="w-6 h-6 animate-spin mb-2 text-solana-purple" />
            <span>Awaiting transactions...</span>
          </div>
        ) : (
          transactions.map((tx) => {
            const isConfirmed = tx.status === 'confirmed';
            const isDropped = tx.status === 'dropped';
            const isRetried = tx.status === 'retried';

            const statusColor = isConfirmed 
              ? 'text-state-healthy' 
              : isDropped 
              ? 'text-state-unhealthy' 
              : 'text-state-degraded';

            const bgClass = isDropped 
              ? 'bg-red-500/5 border-red-500/10' 
              : isRetried 
              ? 'bg-amber-500/5 border-amber-500/10' 
              : 'bg-white/[0.03] border-white/[0.06]';

            const borderClass = isConfirmed 
              ? 'hover:border-state-healthy/20' 
              : isDropped 
              ? 'hover:border-state-unhealthy/20' 
              : 'hover:border-state-degraded/20';

            return (
              <div 
                key={tx.signature} 
                className={`flex items-center justify-between p-3 rounded-lg border ${bgClass} ${borderClass} transition-all duration-300 hover:bg-white/[0.06] animate-slide-in-top`}
              >
                {/* Left: Status Icon & Sig */}
                <div className="flex items-center gap-2">
                  {isConfirmed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-state-healthy shrink-0" />
                  ) : isDropped ? (
                    <XCircle className="w-3.5 h-3.5 text-state-unhealthy shrink-0" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-state-degraded animate-spin shrink-0" />
                  )}
                  <span className="font-semibold text-text-primary text-[12px]">{tx.signature}</span>
                </div>

                {/* Center: Status text, latency, source */}
                <div className="flex items-center gap-3 text-text-secondary">
                  <span className={`font-semibold tracking-wide uppercase text-[10px] ${statusColor}`}>
                    {tx.status}
                  </span>
                  <span>{tx.latencyMs > 0 ? `${tx.latencyMs}ms` : '—'}</span>
                  <span className="bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded text-[9px] text-text-code">
                    {tx.source}
                  </span>
                </div>

                {/* Right: Fee */}
                <div className="text-right text-text-muted text-[10px]">
                  <span>{tx.fee}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer stats badge panel */}
      <div className="p-3 border-t border-white/[0.06] bg-black/25 flex justify-between items-center text-[10px] font-mono text-text-muted select-none">
        <span>CONFIRMED: <span className="text-state-healthy">{confirmedCount}</span></span>
        <span>RETRIED: <span className="text-state-degraded">{retriedCount}</span></span>
        <span>DROPPED: <span className="text-state-unhealthy">{droppedCount}</span></span>
      </div>
    </div>
  );
}
