'use client';

import React from 'react';
import { EndpointMetric } from '@/hooks/useMetricsSocket';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface PoolStatusGridProps {
  endpoints: EndpointMetric[];
}

export function PoolStatusGrid({ endpoints }: PoolStatusGridProps) {
  return (
    <>
      {endpoints.map((ep) => {
        const isHealthy = ep.status === 'healthy';
        const isDegraded = ep.status === 'degraded';
        
        const statusText = ep.status.toUpperCase();
        
        const statusDotClass = isHealthy
          ? 'bg-state-healthy pulse-healthy'
          : isDegraded
          ? 'bg-state-degraded'
          : 'bg-state-unhealthy pulse-unhealthy';

        const badgeClass = isHealthy
          ? 'bg-state-healthy/10 text-state-healthy border border-state-healthy/20'
          : isDegraded
          ? 'bg-state-degraded/10 text-state-degraded border border-state-degraded/20'
          : 'bg-state-unhealthy/10 text-state-unhealthy border border-state-unhealthy/20';

        const strokeColor = isHealthy ? '#14F195' : isDegraded ? '#F59E0B' : '#F43F5E';

        // Format history data for AreaChart (last 30 data points)
        const chartData = ep.history.map((val, i) => ({ slot: i, latency: val }));

        // Grid positioning logic
        // Card 1 & 2 go on Row 6-10. Card 3 & 4 go on Row 11-15.
        // Helius (col 1-4), QuickNode (col 5-8), Triton (col 1-4), Public (col 5-8)
        const gridSpan = 'col-span-12 md:col-span-6 xl:col-span-4 xl:row-span-5';

        return (
          <div 
            key={ep.url} 
            className={`glass-card p-5 flex flex-col justify-between ${gridSpan} group hover:border-white/20`}
          >
            {/* Header: Dot + Name + Status Badge */}
            <div className="flex justify-between items-center select-none">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                <span className="font-display font-bold text-[15px] text-text-primary group-hover:text-white transition-colors">
                  {ep.name}
                </span>
              </div>
              <span className={`text-[9px] font-display font-bold px-2 py-0.5 rounded tracking-wide ${badgeClass}`}>
                {statusText}
              </span>
            </div>

            {/* Sub-header: Truncated Endpoint URL */}
            <div className="text-[11px] font-mono text-text-muted mt-1 truncate">
              {ep.url.replace('https://', '')}
            </div>

            {/* 4 Mini Metrics grid */}
            <div className="grid grid-cols-4 gap-2 border-y border-white/[0.06] py-3.5 my-4 bg-black/5 rounded-lg px-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-display font-medium text-text-muted tracking-wider uppercase">P50</span>
                <span className="font-mono text-sm font-semibold text-text-primary mt-0.5">{ep.latencyP50Ms}ms</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-display font-medium text-text-muted tracking-wider uppercase">P99</span>
                <span className="font-mono text-sm font-semibold text-text-secondary mt-0.5">{ep.latencyP99Ms}ms</span>
              </div>
              <div className="flex flex-col col-span-2">
                <span className="text-[9px] font-display font-medium text-text-muted tracking-wider uppercase">THROUGHPUT</span>
                <span className="font-mono text-sm font-semibold text-text-code mt-0.5">{ep.requestsPerMin.toLocaleString()} req</span>
              </div>
            </div>

            {/* Sparkline Area Chart */}
            <div className="h-[70px] w-full select-none relative mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${ep.name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={strokeColor} stopOpacity={0.15}/>
                      <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="latency" 
                    stroke={strokeColor} 
                    fill={`url(#grad-${ep.name})`} 
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-void/20 to-transparent pointer-events-none" />
            </div>
          </div>
        );
      })}
    </>
  );
}
