import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface Alert {
  id: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

interface AlertBannerProps {
  alerts: Alert[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 mb-6 w-full max-w-[1600px] mx-auto px-6 animate-slide-in-top">
      {alerts.map((alert) => {
        const isError = alert.severity === 'error';
        const isWarning = alert.severity === 'warning';
        
        const bgColor = isError 
          ? 'bg-red-500/10' 
          : isWarning 
          ? 'bg-amber-500/10' 
          : 'bg-solana-purple/10';
        
        const borderColor = isError 
          ? 'border-state-unhealthy/30' 
          : isWarning 
          ? 'border-state-degraded/30' 
          : 'border-solana-purple/30';

        const textColor = isError 
          ? 'text-state-unhealthy' 
          : isWarning 
          ? 'text-state-degraded' 
          : 'text-solana-purple';

        return (
          <div 
            key={alert.id} 
            className={`flex items-center gap-3 p-4 rounded-xl border ${bgColor} ${borderColor} backdrop-blur-md transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.2)]`}
          >
            {isError ? (
              <AlertCircle className={`w-5 h-5 ${textColor} shrink-0`} />
            ) : isWarning ? (
              <AlertTriangle className={`w-5 h-5 ${textColor} shrink-0`} />
            ) : (
              <Info className={`w-5 h-5 ${textColor} shrink-0`} />
            )}
            <span className="text-sm font-medium flex-1 text-text-primary">{alert.message}</span>
          </div>
        );
      })}
    </div>
  );
}
