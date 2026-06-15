'use client';

import React from 'react';
import { useMetricsSocket } from '@/hooks/useMetricsSocket';
import { AlertBanner } from '@/components/AlertBanner';
import { RpcHealthPanel } from '@/components/RpcHealthPanel';
import { PoolStatusGrid } from '@/components/PoolStatusGrid';
import { TxStreamPanel } from '@/components/TxStreamPanel';
import { LiveTerminal } from '@/components/LiveTerminal';
import { 
  Terminal, 
  Activity, 
  Settings, 
  Network, 
  RefreshCw, 
  ExternalLink 
} from 'lucide-react';

export default function Dashboard() {
  const { metrics, connected } = useMetricsSocket();

  // Loading state if WS hasn't loaded first frame
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-void text-text-primary">
        <RefreshCw className="w-8 h-8 text-solana-purple animate-spin mb-4" />
        <span className="font-display font-medium text-sm tracking-wide">CONNECTING TO HELIX RESILIENCE DAEMON...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-void text-text-primary font-sans">
      {/* 1. Sidebar (220px fixed) */}
      <aside className="w-[220px] bg-surface-1 border-r border-border-subtle flex flex-col justify-between p-5 select-none shrink-0">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 font-display font-bold text-lg text-text-primary tracking-tight">
            <span className="w-5 h-5 flex items-center justify-center bg-solana-purple rounded text-white font-mono text-xs">⬡</span>
            HELIX SDK
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1">
            <span className="text-[10px] font-display font-bold tracking-wider text-text-muted uppercase mb-2">MONITORING</span>
            
            <a href="#" className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium bg-surface-2 border-l-2 border-solana-purple text-text-primary">
              <Activity className="w-4 h-4 text-solana-purple" />
              Overview
            </a>
            <a href="#" className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              <Network className="w-4 h-4" />
              Endpoints
            </a>
            <a href="#" className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              <Terminal className="w-4 h-4" />
              Transactions
            </a>
            <a href="#" className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </a>
          </nav>
        </div>

        {/* Sidebar Footer status */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <span className="text-[10px] font-display font-bold tracking-wider text-text-muted uppercase">POOL STATUS</span>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
            <span className="w-2 h-2 rounded-full bg-state-healthy pulse-healthy" />
            <span>{metrics.pool.healthyCount} healthy</span>
          </div>
          {metrics.pool.degradedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
              <span className="w-2 h-2 rounded-full bg-state-degraded" />
              <span>{metrics.pool.degradedCount} degraded</span>
            </div>
          )}
          <div className="text-[10px] text-text-muted mt-2 flex items-center justify-between">
            <span>Daemon: {connected ? 'Live' : 'Offline'}</span>
            <span className={connected ? 'text-state-healthy' : 'text-state-unhealthy'}>●</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Content */}
      <main className="flex-1 p-8 flex flex-col gap-6 overflow-y-auto max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-border-subtle pb-4">
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-text-primary">RPC Pool Health Monitor</h1>
            <p className="text-xs text-text-secondary mt-1">Real-time failover diagnostic console for Solana cluster configurations</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
            <span>Last sync: {new Date(metrics.timestamp).toLocaleTimeString()}</span>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-1 text-solana-purple hover:underline"
            >
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </header>

        {/* Alerts Banner */}
        <AlertBanner alerts={metrics.alerts} />

        {/* Stats Summary Panel */}
        <RpcHealthPanel endpoints={metrics.endpoints} transactions={metrics.transactions} />

        {/* Main Dashboard Layout Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Columns (Pool Grid + Live Terminal) */}
          <div className="xl:col-span-2 flex flex-col gap-6">
            <PoolStatusGrid endpoints={metrics.endpoints} />
            <LiveTerminal endpoints={metrics.endpoints} />
          </div>

          {/* Right Column (Live Tx Stream) */}
          <div className="xl:col-span-1">
            <TxStreamPanel transactions={metrics.transactions} />
          </div>
        </div>
      </main>
    </div>
  );
}
