'use client';

import { useEffect, useState, useRef } from 'react';

export interface EndpointMetric {
  url: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyP50Ms: number;
  latencyP99Ms: number;
  requestsPerMin: number;
  history: number[];
}

export interface TransactionMetric {
  signature: string;
  status: 'confirmed' | 'dropped' | 'retried';
  latencyMs: number;
  source: 'Jito' | 'RPC';
  fee: string;
  timeAgo: string;
}

export interface MetricsFrame {
  timestamp: number;
  endpoints: EndpointMetric[];
  transactions: TransactionMetric[];
  pool: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  };
  alerts: Array<{ id: string; message: string; severity: 'warning' | 'error' | 'info' }>;
}

export function useMetricsSocket() {
  const [metrics, setMetrics] = useState<MetricsFrame | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      try {
        const socket = new WebSocket('ws://localhost:3001');

        socket.onopen = () => {
          setConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data) as MetricsFrame;
            setMetrics(frame);
          } catch (err) {
            console.error('Failed to parse metrics frame:', err);
          }
        };

        socket.onclose = () => {
          setConnected(false);
          // Retry connection after 2 seconds
          reconnectTimeout = setTimeout(connect, 2000);
        };

        socket.onerror = (err) => {
          console.error('WebSocket connection error:', err);
          try {
            socket.close();
          } catch (e) {}
        };

        wsRef.current = socket;
      } catch (err) {
        console.error('Failed to construct WebSocket:', err);
        setConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  return { metrics, connected };
}
