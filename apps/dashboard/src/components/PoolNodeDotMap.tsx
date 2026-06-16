'use client';

import React from 'react';
import { EndpointMetric } from '@/hooks/useMetricsSocket';
import { Activity } from 'lucide-react';

interface PoolNodeDotMapProps {
  endpoints: EndpointMetric[];
}

export function PoolNodeDotMap({ endpoints }: PoolNodeDotMapProps) {
  const totalReqPerMin = endpoints.reduce((sum, ep) => sum + ep.requestsPerMin, 0);

  // Pool capacity computation (assume max capacity is 5000 req/min)
  const maxCapacity = 5000;
  const capacityPct = Math.min(100, (totalReqPerMin / maxCapacity) * 100);

  return (
    <div className="glass-card p-5 flex flex-col justify-between col-span-12 xl:row-span-3 hover:border-white/20 select-none">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-solana-purple shrink-0" />
          <h3 className="font-display font-semibold text-[14px] text-text-primary uppercase tracking-wider">
            POOL NODE DISTRIBUTION MAP
          </h3>
        </div>
        <span className="text-xs font-mono text-text-secondary">
          Total Load: {totalReqPerMin.toLocaleString()} req/min
        </span>
      </div>

      {/* Dot Matrix Clusters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 my-4 py-1">
        {endpoints.map((ep) => {
          const isHealthy = ep.status === 'healthy';
          const isDegraded = ep.status === 'degraded';

          const dotColorClass = isHealthy 
            ? 'bg-state-healthy' 
            : isDegraded 
            ? 'bg-state-degraded' 
            : 'bg-state-unhealthy';

          // Determine dot density: 1 dot per 80 requests/min (min 2, max 20)
          const dotCount = Math.max(2, Math.min(20, Math.round(ep.requestsPerMin / 80)));

          return (
            <div key={ep.url} className="flex flex-col bg-white/[0.01] border border-white/[0.04] p-3 rounded-xl hover:bg-white/[0.03] transition-all duration-300">
              <div className="flex justify-between items-center mb-2">
                <span className="font-display font-bold text-xs text-text-primary">{ep.name}</span>
                <span className="font-mono text-[10px] text-text-muted">{ep.requestsPerMin} req/m</span>
              </div>
              
              {/* Dot matrix grid */}
              <div className="flex flex-wrap gap-1 h-[24px] items-center">
                {Array.from({ length: dotCount }).map((_, i) => (
                  <span 
                    key={i} 
                    className={`w-2 h-2 rounded-full opacity-80 ${dotColorClass} transition-all duration-300 ${isHealthy ? 'hover:scale-125' : 'animate-pulse'}`}
                    style={{ 
                      animationDelay: `${i * 100}ms`,
                      transform: isDegraded ? 'scale(1.1)' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Capacity Progress bar */}
      <div className="pt-3 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-text-muted text-[10px] uppercase font-display shrink-0">POOL LOAD SCALE:</span>
          <div className="h-2 flex-1 bg-white/5 border border-white/5 rounded-full overflow-hidden relative">
            <div 
              className="h-full bg-gradient-to-r from-solana-purple to-state-healthy transition-all duration-500 rounded-full" 
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <span className="text-text-secondary text-[11px] shrink-0 font-semibold">{capacityPct.toFixed(1)}%</span>
        </div>
        <span className="text-[10px] text-text-muted uppercase text-right shrink-0">
          Max Capacity: {maxCapacity.toLocaleString()} req/m
        </span>
      </div>
    </div>
  );
}
