'use client';

import React, { useState, useEffect } from 'react';
import { Cpu, ShieldAlert, Zap, Globe } from 'lucide-react';

export function JitoStatusCard() {
  const [bundlesCount, setBundlesCount] = useState(847);
  const [avgTip, setAvgTip] = useState(5420);
  const [lastBundleSecs, setLastBundleSecs] = useState(2);

  useEffect(() => {
    // Simulate live Jito activity
    const interval = setInterval(() => {
      setLastBundleSecs((prev) => {
        if (prev >= 10 || Math.random() > 0.7) {
          // New bundle processed!
          setBundlesCount((c) => c + 1);
          setAvgTip((t) => Math.max(3000, Math.min(8000, t + Math.floor(Math.random() * 200 - 100))));
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-card p-5 flex flex-col justify-between col-span-12 xl:col-span-4 xl:row-span-3 hover:border-white/20 group">
      {/* Header */}
      <div className="flex justify-between items-center select-none">
        <span className="text-[10px] font-display font-medium tracking-widest text-text-muted uppercase">JITO MEV PROTECTION</span>
        <Globe className="w-4 h-4 text-state-jito shrink-0" />
      </div>

      {/* Hero Active Status */}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-state-jito pulse-jito" />
        <span className="text-xl font-display font-bold tracking-tight text-state-jito uppercase">ACTIVE</span>
      </div>

      {/* Mini Details grid */}
      <div className="grid grid-cols-2 gap-3 my-3 text-xs font-mono border-t border-white/[0.04] pt-3">
        <div className="flex flex-col">
          <span className="text-text-muted text-[9px] uppercase font-display">BUNDLES TODAY</span>
          <span className="text-text-primary font-semibold text-sm mt-0.5 metric-number">{bundlesCount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-muted text-[9px] uppercase font-display">AVG TIP</span>
          <span className="text-text-primary font-semibold text-sm mt-0.5 metric-number">{avgTip.toLocaleString()} lam</span>
        </div>
      </div>

      {/* Region Status and Latency Indicators */}
      <div className="flex flex-col gap-2 border-t border-white/[0.04] pt-3">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-text-muted font-display uppercase">REGIONAL NODES</span>
          <span className="text-state-jito font-semibold font-mono">4/6 active</span>
        </div>
        {/* Region Pills */}
        <div className="flex gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-state-healthy/10 border border-state-healthy/20 text-state-healthy text-[9px] font-semibold font-mono">
            NY (34ms)
          </span>
          <span className="px-2 py-0.5 rounded bg-state-healthy/10 border border-state-healthy/20 text-state-healthy text-[9px] font-semibold font-mono">
            AMS (82ms)
          </span>
          <span className="px-2 py-0.5 rounded bg-state-degraded/10 border border-state-degraded/20 text-state-degraded text-[9px] font-semibold font-mono">
            FRA (142ms)
          </span>
          <span className="px-2 py-0.5 rounded bg-state-healthy/10 border border-state-healthy/20 text-state-healthy text-[9px] font-semibold font-mono">
            TKO (98ms)
          </span>
        </div>
      </div>

      {/* Last bundle timestamp footer */}
      <div className="text-[10px] text-text-muted font-mono border-t border-white/[0.04] pt-2.5 mt-2 flex justify-between select-none">
        <span>MEV Protection shield</span>
        <span>Last bundle: {lastBundleSecs}s ago</span>
      </div>
    </div>
  );
}
