'use client';

import React, { useEffect, useState, useRef } from 'react';
import { EndpointMetric } from '@/hooks/useMetricsSocket';

interface LiveTerminalProps {
  endpoints: EndpointMetric[];
}

interface LogLine {
  timestamp: string;
  type: 'info' | 'warn' | 'success' | 'system';
  message: string;
}

export function LiveTerminal({ endpoints }: LiveTerminalProps) {
  const [logs, setLogs] = useState<LogLine[]>([
    { timestamp: '15:26:17', type: 'system', message: 'Helix Reliability Daemon v0.1.0 started' },
    { timestamp: '15:26:17', type: 'info', message: 'Establishing connections to RPC pool nodes...' },
    { timestamp: '15:26:18', type: 'success', message: 'Pool connection established. 4 endpoints registered.' },
  ]);

  const prevTritonStatus = useRef<'healthy' | 'degraded' | 'unhealthy'>('healthy');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const triton = endpoints.find((e) => e.name === 'Triton');
    if (!triton) return;

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (triton.status !== prevTritonStatus.current) {
      const status = triton.status;
      const latency = triton.latencyP50Ms;
      setTimeout(() => {
        if (status === 'degraded') {
          // Trigger degradation failover logs
          setLogs((prev) => [
            ...prev,
            { timestamp, type: 'warn', message: `FAILOVER: Triton latency spiked to ${latency}ms. Routing degraded.` },
            { timestamp, type: 'info', message: `FAILOVER: Re-routing traffic to Helius (47ms) - failover resolved in 82ms.` },
            { timestamp, type: 'success', message: `ROUTE: Active route successfully set to Helius.` },
          ]);
        } else if (status === 'healthy') {
          // Recover logs
          setLogs((prev) => [
            ...prev,
            { timestamp, type: 'success', message: `RECOVER: Triton latency restored to ${latency}ms.` },
            { timestamp, type: 'info', message: `POOL: Triton re-added to load-balanced pool hierarchy.` },
          ]);
        }
      }, 0);
      prevTritonStatus.current = triton.status;
    }
  }, [endpoints]);

  // Auto scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-[#05050A] border border-border-default rounded-lg overflow-hidden flex flex-col h-[480px] font-mono text-xs shadow-2xl">
      {/* Terminal Title Bar */}
      <div className="bg-surface-1 px-4 py-2.5 border-b border-border-subtle flex justify-between items-center select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
        </div>
        <span className="text-text-muted font-display font-medium text-[10px] tracking-wider uppercase">HELIX RESILIENCE TERMINAL</span>
        <div className="w-12" />
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 scrollbar-thin text-text-code">
        {logs.map((log, idx) => {
          const typeColor = 
            log.type === 'success' 
              ? 'text-state-healthy' 
              : log.type === 'warn' 
              ? 'text-state-degraded font-semibold' 
              : log.type === 'system' 
              ? 'text-solana-purple' 
              : 'text-text-secondary';

          return (
            <div key={idx} className="flex gap-2 leading-relaxed">
              <span className="text-text-muted select-none">[{log.timestamp}]</span>
              <span className={typeColor}>{log.message}</span>
            </div>
          );
        })}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
