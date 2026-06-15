'use client';

import React, { useState } from 'react';
import { EndpointMetric } from '@/hooks/useMetricsSocket';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';

interface PoolStatusGridProps {
  endpoints: EndpointMetric[];
}

export function PoolStatusGrid({ endpoints }: PoolStatusGridProps) {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const toggleExpand = (url: string) => {
    setExpandedEndpoint(expandedEndpoint === url ? null : url);
  };

  return (
    <div className="bg-surface-1 border border-border-default rounded-lg overflow-hidden mb-6">
      <div className="p-4 border-b border-border-subtle flex justify-between items-center">
        <h2 className="font-display font-semibold text-lg tracking-tight text-text-primary">RPC POOL STATUS</h2>
        <span className="text-sm font-mono text-text-secondary">
          {endpoints.filter((e) => e.status === 'healthy').length} healthy ·{' '}
          {endpoints.filter((e) => e.status === 'degraded').length} degraded
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle text-xs font-display uppercase tracking-wider text-text-muted">
              <th className="p-4 pl-6">Endpoint</th>
              <th className="p-4">Status</th>
              <th className="p-4">P50 Latency</th>
              <th className="p-4">P99 Latency</th>
              <th className="p-4 text-right pr-6">Req/Min</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => {
              const isExpanded = expandedEndpoint === ep.url;
              const isHealthy = ep.status === 'healthy';
              const isDegraded = ep.status === 'degraded';
              
              const statusText = ep.status.toUpperCase();
              const statusColor = isHealthy 
                ? 'text-state-healthy' 
                : isDegraded 
                ? 'text-state-degraded' 
                : 'text-state-unhealthy';

              // Format history data for AreaChart
              const chartData = ep.history.map((val, idx) => ({ slot: idx, latency: val }));

              return (
                <React.Fragment key={ep.url}>
                  <tr 
                    onClick={() => toggleExpand(ep.url)}
                    className="border-b border-border-subtle hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
                  >
                    <td className="p-4 pl-6 flex items-center gap-3 font-mono text-sm text-text-code">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                      {ep.name}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-state-healthy pulse-healthy' : isDegraded ? 'bg-state-degraded' : 'bg-state-unhealthy pulse-unhealthy'}`} />
                        <span className={`text-xs font-display font-medium tracking-wide ${statusColor}`}>{statusText}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-sm text-text-primary">{ep.latencyP50Ms}ms</td>
                    <td className="p-4 font-mono text-sm text-text-secondary">{ep.latencyP99Ms}ms</td>
                    <td className="p-4 text-right pr-6 font-mono text-sm text-text-code">{ep.requestsPerMin.toLocaleString()}</td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-surface-2 border-b border-border-subtle">
                      <td colSpan={5} className="p-6">
                        <div className="h-[120px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                              <XAxis dataKey="slot" hide />
                              <YAxis tick={{ fill: '#55547A', fontSize: 10 }} axisLine={false} tickLine={false} />
                              <Area 
                                type="monotone" 
                                dataKey="latency" 
                                stroke={isHealthy ? '#14F195' : isDegraded ? '#F59E0B' : '#F43F5E'} 
                                fill={isHealthy ? 'rgba(20, 241, 149, 0.08)' : isDegraded ? 'rgba(245, 158, 11, 0.08)' : 'rgba(244, 63, 94, 0.08)'} 
                                strokeWidth={1.5}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
