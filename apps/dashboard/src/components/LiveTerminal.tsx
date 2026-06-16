'use client';

import React, { useEffect, useState, useRef } from 'react';
import { EndpointMetric } from '@/hooks/useMetricsSocket';
import { Terminal, Cpu, Server, ShieldCheck, Zap } from 'lucide-react';

interface LiveTerminalProps {
  endpoints: EndpointMetric[];
}

interface LogLine {
  timestamp: string;
  type: 'SYS' | 'OK' | 'WARN' | 'FAIL' | 'JITO' | 'INFO';
  message: string;
}

export function LiveTerminal({ endpoints }: LiveTerminalProps) {
  const [logs, setLogs] = useState<LogLine[]>([
    { timestamp: '15:26:17', type: 'SYS', message: 'Helix Reliability Daemon v0.1.0 started' },
    { timestamp: '15:26:17', type: 'INFO', message: 'Establishing connections to RPC pool nodes...' },
    { timestamp: '15:26:18', type: 'OK', message: 'Pool connection established. 4 endpoints registered.' },
  ]);

  const prevTritonStatus = useRef<'healthy' | 'degraded' | 'unhealthy'>('healthy');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Compute stats for the footer
  const totalNodes = endpoints.length;
  const totalReqPerMin = endpoints.reduce((sum, ep) => sum + ep.requestsPerMin, 0);
  const p50s = endpoints.map((e) => e.status === 'healthy' ? e.latencyP50Ms : 0).filter(Boolean);
  const avgLatency = p50s.length > 0 ? Math.round(p50s.reduce((a, b) => a + b, 0) / p50s.length) : 0;

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
          setLogs((prev) => {
            const nextLogs = [
              ...prev,
              { timestamp, type: 'WARN' as const, message: `FAILOVER: Triton latency spiked to ${latency}ms. Routing degraded.` },
              { timestamp, type: 'INFO' as const, message: `FAILOVER: Re-routing traffic to Helius (47ms) - failover resolved in 82ms.` },
              { timestamp, type: 'OK' as const, message: `ROUTE: Active route successfully set to Helius.` },
            ];
            return nextLogs.slice(-50); // Keep last 50 logs
          });
        } else if (status === 'healthy') {
          // Recover logs
          setLogs((prev) => {
            const nextLogs = [
              ...prev,
              { timestamp, type: 'OK' as const, message: `RECOVER: Triton latency restored to ${latency}ms.` },
              { timestamp, type: 'INFO' as const, message: `POOL: Triton re-added to load-balanced pool hierarchy.` },
            ];
            return nextLogs.slice(-50);
          });
        }
      }, 0);
      prevTritonStatus.current = triton.status;
    }
  }, [endpoints]);

  // Periodic random logs to simulate activity (Jito / RPC transactions)
  useEffect(() => {
    const interval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      const isJito = Math.random() > 0.5;
      const randHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      
      setLogs((prev) => {
        const nextLogs = [
          ...prev,
          { 
            timestamp, 
            type: isJito ? ('JITO' as const) : ('OK' as const), 
            message: isJito 
              ? `TX ${randHex}... bundle confirmed via Jito MEV engine` 
              : `TX ${randHex}... transaction finalized on slot ${Math.floor(287483921 + Math.random() * 1000)}` 
          }
        ];
        return nextLogs.slice(-50);
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Auto scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="glass-card flex flex-col h-full col-span-12 xl:col-span-8 xl:row-span-5 shadow-2xl border-white/10 bg-white/[0.06]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex justify-between items-center select-none bg-black/20">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-state-healthy pulse-healthy" />
          <span className="font-display font-semibold text-[13px] text-text-primary">Helix Daemon Active</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          <Terminal className="w-3.5 h-3.5" />
          <span>SYS_STATUS: OK</span>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5 scrollbar-thin font-mono text-[12px] text-text-code bg-black/15 min-h-[220px]">
        {logs.map((log, idx) => {
          let tagColor = 'text-white/40';
          if (log.type === 'OK') tagColor = 'text-state-healthy';
          else if (log.type === 'WARN') tagColor = 'text-state-degraded font-semibold';
          else if (log.type === 'FAIL') tagColor = 'text-state-unhealthy font-semibold';
          else if (log.type === 'JITO') tagColor = 'text-state-jito font-semibold';
          else if (log.type === 'INFO') tagColor = 'text-solana-purple';

          return (
            <div key={idx} className="flex gap-2.5 leading-relaxed animate-slide-in-top">
              <span className="text-text-muted select-none">[{log.timestamp}]</span>
              <span className={`w-[45px] shrink-0 font-bold ${tagColor}`}>[{log.type}]</span>
              <span className="text-text-primary/90">{log.message}</span>
            </div>
          );
        })}
        <div ref={terminalEndRef} />
      </div>

      {/* Footer statistics bar */}
      <div className="px-4 py-2.5 border-t border-white/[0.06] bg-black/30 flex flex-wrap gap-4 items-center justify-between text-[11px] font-mono text-text-secondary select-none">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
            <Server className="w-3 h-3 text-solana-purple" />
            <span>{totalNodes} NODES</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
            <Cpu className="w-3 h-3 text-state-jito" />
            <span>{totalReqPerMin.toLocaleString()} REQ/MIN</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
            <ShieldCheck className="w-3 h-3 text-state-healthy" />
            <span>99.85% SLA</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
            <Zap className="w-3 h-3 text-solana-purple" />
            <span>{avgLatency > 0 ? `${avgLatency}MS` : '--'} AVG</span>
          </div>
        </div>
        <span className="text-[10px] text-text-muted uppercase">Daemon version: v0.1.0</span>
      </div>
    </div>
  );
}
