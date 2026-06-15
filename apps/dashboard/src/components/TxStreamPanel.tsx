'use client';

import React from 'react';
import { TransactionMetric } from '@/hooks/useMetricsSocket';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface TxStreamPanelProps {
  transactions: TransactionMetric[];
}

export function TxStreamPanel({ transactions }: TxStreamPanelProps) {
  return (
    <div className="bg-surface-1 border border-border-default rounded-lg overflow-hidden flex flex-col h-[480px]">
      <div className="p-4 border-b border-border-subtle flex justify-between items-center">
        <h2 className="font-display font-semibold text-lg tracking-tight text-text-primary">TRANSACTION STREAM</h2>
        <span className="text-xs font-mono text-text-muted flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-solana-purple" />
          LIVE FEED
        </span>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs p-4 flex flex-col gap-2">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <RefreshCw className="w-6 h-6 animate-spin mb-2" />
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
              ? 'bg-[rgba(244,63,94,0.03)] border-[rgba(244,63,94,0.08)]' 
              : isRetried 
              ? 'bg-[rgba(245,158,11,0.03)] border-[rgba(245,158,11,0.08)]' 
              : 'bg-surface-2 border-border-subtle';

            return (
              <div 
                key={tx.signature} 
                className={`flex items-center justify-between p-3 rounded border ${bgClass} transition-all duration-300 hover:border-border-strong`}
              >
                {/* Left: Signature & Status Icon */}
                <div className="flex items-center gap-2.5">
                  {isConfirmed ? (
                    <CheckCircle2 className="w-4 h-4 text-state-healthy" />
                  ) : isDropped ? (
                    <XCircle className="w-4 h-4 text-state-unhealthy" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-state-degraded animate-spin" />
                  )}
                  <span className="font-semibold text-text-primary">{tx.signature}</span>
                </div>

                {/* Center: Info & Metres */}
                <div className="flex items-center gap-4 text-text-secondary">
                  <span className={`font-semibold tracking-wide uppercase ${statusColor}`}>
                    {tx.status}
                  </span>
                  <span>{tx.latencyMs > 0 ? `${tx.latencyMs}ms` : '—'}</span>
                  <span className="bg-surface-3 px-1.5 py-0.5 rounded text-[10px] text-text-code">
                    {tx.source}
                  </span>
                </div>

                {/* Right: Fees & Time */}
                <div className="flex items-center gap-4 text-right">
                  <span className="text-text-muted">{tx.fee}</span>
                  <span className="text-text-muted min-w-[50px]">{tx.timeAgo}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
