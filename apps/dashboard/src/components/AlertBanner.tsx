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
    <div className="flex flex-col gap-3 mb-6">
      {alerts.map((alert) => {
        const isError = alert.severity === 'error';
        const isWarning = alert.severity === 'warning';
        
        const bgColor = isError 
          ? 'bg-[rgba(244,63,94,0.08)]' 
          : isWarning 
          ? 'bg-[rgba(245,158,11,0.08)]' 
          : 'bg-[rgba(153,69,255,0.08)]';
        
        const borderColor = isError 
          ? 'border-state-unhealthy' 
          : isWarning 
          ? 'border-state-degraded' 
          : 'border-solana-purple';

        const textColor = isError 
          ? 'text-state-unhealthy' 
          : isWarning 
          ? 'text-state-degraded' 
          : 'text-solana-purple';

        return (
          <div 
            key={alert.id} 
            className={`flex items-center gap-3 p-4 rounded-md border-l-4 ${bgColor} ${borderColor} transition-all duration-250 animate-slide-down`}
          >
            {isError ? (
              <AlertCircle className={`w-5 h-5 ${textColor}`} />
            ) : isWarning ? (
              <AlertTriangle className={`w-5 h-5 ${textColor}`} />
            ) : (
              <Info className={`w-5 h-5 ${textColor}`} />
            )}
            <span className="text-sm font-medium flex-1 text-text-primary">{alert.message}</span>
          </div>
        );
      })}
    </div>
  );
}
