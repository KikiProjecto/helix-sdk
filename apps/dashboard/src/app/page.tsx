'use client';

import React, { useState } from 'react';
import { useMetricsSocket } from '@/hooks/useMetricsSocket';
import { AlertBanner } from '@/components/AlertBanner';
import { RpcHealthPanel } from '@/components/RpcHealthPanel';
import { PoolStatusGrid } from '@/components/PoolStatusGrid';
import { LiveTerminal } from '@/components/LiveTerminal';
import { TxStreamPanel } from '@/components/TxStreamPanel';
import { JitoStatusCard } from '@/components/JitoStatusCard';
import { PoolNodeDotMap } from '@/components/PoolNodeDotMap';

export default function Dashboard() {
  const { metrics, connected } = useMetricsSocket();
  const [activeTab, setActiveTab] = useState<'overview' | 'endpoints' | 'transactions' | 'settings'>('overview');

  // Loading state if WS hasn't loaded first frame
  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen relative overflow-hidden bg-void">
        {/* Ambient glows inside loading page */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-[20%] right-[30%] w-[300px] h-[300px] rounded-full bg-solana-purple/10 blur-[80px]" />
          <div className="absolute bottom-[30%] left-[20%] w-[300px] h-[300px] rounded-full bg-state-jito/10 blur-[80px]" />
        </div>
        <div className="z-10 flex flex-col items-center">
          <span className="w-12 h-12 flex items-center justify-center bg-solana-purple rounded-xl text-white font-mono text-xl font-bold mb-4 shadow-[0_8px_32px_rgba(153,69,255,0.3)] select-none">⬡</span>
          <h1 className="font-display font-bold text-lg tracking-widest text-text-primary uppercase">HELIX RESILIENCE DAEMON</h1>
          <p className="text-xs text-text-secondary mt-1 tracking-wide">Connecting to RPC pool...</p>
          {/* Animated progress bar */}
          <div className="h-1 w-48 bg-white/5 border border-white/5 rounded-full overflow-hidden mt-6 relative">
            <div className="h-full bg-solana-purple rounded-full w-24 absolute top-0 left-0 animate-progress-loading" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-8 px-4 sm:px-6 lg:px-8 flex flex-col gap-6 bg-void relative">
      {/* 1. Floating Navigation Pill */}
      <div className="nav-pill select-none">
        <span className="w-5 h-5 flex items-center justify-center bg-solana-purple rounded text-white font-mono text-xs font-bold mr-2">⬡</span>
        <span className="font-display font-bold text-sm tracking-tight text-text-primary mr-4">helix</span>
        
        <button 
          onClick={() => setActiveTab('overview')} 
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('endpoints')} 
          className={`nav-tab ${activeTab === 'endpoints' ? 'active' : ''}`}
        >
          Endpoints
        </button>
        <button 
          onClick={() => setActiveTab('transactions')} 
          className={`nav-tab ${activeTab === 'transactions' ? 'active' : ''}`}
        >
          Transactions
        </button>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
        >
          Settings
        </button>

        <div className="nav-status">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-state-healthy pulse-healthy' : 'bg-state-unhealthy pulse-unhealthy'}`} />
          <span className="hidden sm:inline uppercase text-[9px] font-bold">
            {connected ? 'daemon: live' : 'daemon: offline'}
          </span>
        </div>
      </div>

      {/* Alerts Banner (always visible at top of body if alerts exist) */}
      <AlertBanner alerts={metrics.alerts} />

      {/* Main bento grid layout based on tab view */}
      <div className="bento-grid w-full">
        {activeTab === 'overview' && (
          <>
            {/* Rows 1-5: Hero Terminal (Left) */}
            <LiveTerminal endpoints={metrics.endpoints} />

            {/* Rows 1-2: Latency & Uptime metrics (Right) */}
            <RpcHealthPanel endpoints={metrics.endpoints} transactions={metrics.transactions} />

            {/* Rows 3-5: Jito Status (Right) */}
            <JitoStatusCard />

            {/* Rows 6-15: Individual Endpoint Health Cards (4 endpoints) */}
            <PoolStatusGrid endpoints={metrics.endpoints} />

            {/* Rows 6-15: Live Transaction Stream (Right) */}
            <TxStreamPanel transactions={metrics.transactions} />

            {/* Rows 16-17: Bottom full-width map (Left) */}
            <PoolNodeDotMap endpoints={metrics.endpoints} />
          </>
        )}

        {activeTab === 'endpoints' && (
          <div className="col-span-12 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <PoolStatusGrid endpoints={metrics.endpoints} />
            </div>
            <div className="w-full">
              <PoolNodeDotMap endpoints={metrics.endpoints} />
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="col-span-12 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-8 flex flex-col gap-6">
              <LiveTerminal endpoints={metrics.endpoints} />
            </div>
            <div className="xl:col-span-4 flex flex-col gap-6">
              <JitoStatusCard />
              <TxStreamPanel transactions={metrics.transactions} />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="col-span-12 glass-card p-6 md:p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full hover:border-white/10">
            <div>
              <h2 className="font-display font-semibold text-lg tracking-tight text-text-primary">SETTINGS & SYSTEM INFORMATION</h2>
              <p className="text-xs text-text-secondary mt-1">Configure and view local Helix SDK configurations</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/[0.06] pt-6">
              <div className="flex flex-col gap-4">
                <h3 className="font-display font-semibold text-sm text-text-primary uppercase tracking-wider">DAEMON STATE</h3>
                <div className="flex flex-col gap-2 bg-black/10 border border-white/[0.04] p-4 rounded-xl text-xs font-mono text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span>Host Connection</span>
                    <span className={connected ? 'text-state-healthy font-bold' : 'text-state-unhealthy font-bold'}>
                      {connected ? 'CONNECTED (localhost:3001)' : 'OFFLINE (Fallback Active)'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span>Bearer Token Authentication</span>
                    <span className="text-text-primary font-bold">Enabled</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Active Environment</span>
                    <span className="text-solana-purple font-bold">mainnet-beta</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-display font-semibold text-sm text-text-primary uppercase tracking-wider">FAILOVER THRESHOLDS</h3>
                <div className="flex flex-col gap-2 bg-black/10 border border-white/[0.04] p-4 rounded-xl text-xs font-mono text-text-secondary">
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span>Degradation Latency Limit</span>
                    <span className="text-text-primary">1,500 ms</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/[0.04]">
                    <span>RPC Pool Health Revalidation</span>
                    <span className="text-text-primary">5,000 ms</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Transaction Expiry Limit</span>
                    <span className="text-text-primary">15s (25 slots)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-6 flex flex-col gap-3 text-xs text-text-secondary">
              <h3 className="font-display font-semibold text-sm text-text-primary uppercase tracking-wider">DEVELOPER INTEGRATION</h3>
              <p>The Helix Resilience Daemon acts as a local reverse proxy for all Solana RPC traffic. Route your HTTP requests and Web3 clients to port 3001 to activate failover shielding:</p>
              <pre className="bg-[#05050A] border border-white/[0.06] p-4 rounded-lg text-text-code overflow-x-auto">
{`import { HelixRpcClient } from '@helix-sdk/core';

const client = new HelixRpcClient({
  endpoints: [
    'https://mainnet.helius-rpc.com',
    'https://solana-mainnet.quiknode.pro'
  ],
  fallbackTimeoutMs: 1500
});`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
