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

const initialEndpoints: EndpointMetric[] = [
  { url: 'https://mainnet.helius-rpc.com', name: 'Helius', status: 'healthy', latencyP50Ms: 47, latencyP99Ms: 112, requestsPerMin: 1204, history: Array(30).fill(47) },
  { url: 'https://solana-mainnet.quiknode.pro', name: 'QuickNode', status: 'healthy', latencyP50Ms: 82, latencyP99Ms: 198, requestsPerMin: 892, history: Array(30).fill(82) },
  { url: 'https://ssc-dao.genesysgo.net', name: 'Triton', status: 'healthy', latencyP50Ms: 120, latencyP99Ms: 250, requestsPerMin: 512, history: Array(30).fill(120) },
  { url: 'https://api.mainnet-beta.solana.com', name: 'Public', status: 'healthy', latencyP50Ms: 234, latencyP99Ms: 689, requestsPerMin: 312, history: Array(30).fill(234) },
];

const initialTransactions: TransactionMetric[] = [
  { signature: '7xKm5t7m8pQr', status: 'confirmed', latencyMs: 47, source: 'Jito', fee: '0.000012 SOL', timeAgo: '2s ago' },
  { signature: '3bNp9wXsG5a3', status: 'confirmed', latencyMs: 120, source: 'RPC', fee: '0.000008 SOL', timeAgo: '4s ago' },
  { signature: '2mYt7kPlr2b8', status: 'retried', latencyMs: 340, source: 'RPC', fee: '0.000015 SOL', timeAgo: '6s ago' },
];

// Client-side mock metrics generator
function generateMockFrame(tickCount: number, currentEndpoints: EndpointMetric[], currentTransactions: TransactionMetric[]): MetricsFrame {
  // Update endpoints with random noise
  const nextEndpoints = currentEndpoints.map((ep) => {
    const noise = Math.floor(Math.random() * 10 - 5);
    let status = ep.status;
    let latencyP50Ms = ep.latencyP50Ms;
    let latencyP99Ms = ep.latencyP99Ms;
    let requestsPerMin = ep.requestsPerMin;

    if (ep.name === 'Triton') {
      if (tickCount % 20 >= 15) {
        status = 'degraded';
        latencyP50Ms = 1847 + noise;
        latencyP99Ms = 4200 + noise;
        requestsPerMin = Math.max(10, requestsPerMin - 80);
      } else {
        status = 'healthy';
        latencyP50Ms = 120 + noise;
        latencyP99Ms = 250 + noise;
        requestsPerMin = 512 + noise;
      }
    } else {
      latencyP50Ms = Math.max(10, latencyP50Ms + noise);
      latencyP99Ms = Math.max(20, latencyP99Ms + noise * 2);
      requestsPerMin = Math.max(100, requestsPerMin + Math.floor(Math.random() * 20 - 10));
    }

    const history = [...ep.history, latencyP50Ms];
    if (history.length > 30) history.shift();

    return {
      ...ep,
      status,
      latencyP50Ms,
      latencyP99Ms,
      requestsPerMin,
      history,
    };
  });

  // Periodically add new transaction
  const nextTransactions = [...currentTransactions];
  if (Math.random() > 0.4) {
    const isJito = Math.random() > 0.4;
    const isDropped = Math.random() > 0.95;
    const isRetried = !isDropped && Math.random() > 0.85;
    const status = isDropped ? 'dropped' : isRetried ? 'retried' : 'confirmed';

    const source = isJito ? 'Jito' : 'RPC';
    const latency = isDropped ? 0 : isJito ? Math.floor(Math.random() * 30 + 40) : Math.floor(Math.random() * 150 + 60);
    const charList = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const randomSig = Array.from({ length: 12 }, () => charList[Math.floor(Math.random() * charList.length)]).join('');

    nextTransactions.unshift({
      signature: randomSig.substring(0, 4) + '...' + randomSig.substring(8, 12),
      status,
      latencyMs: latency,
      source,
      fee: isJito ? '0.000012 SOL' : '0.000005 SOL',
      timeAgo: 'Just now',
    });

    if (nextTransactions.length > 50) {
      nextTransactions.pop();
    }
  }

  nextTransactions.forEach((tx, idx) => {
    if (idx > 0) {
      tx.timeAgo = `${idx * 2}s ago`;
    }
  });

  const healthyCount = nextEndpoints.filter((e) => e.status === 'healthy').length;
  const degradedCount = nextEndpoints.filter((e) => e.status === 'degraded').length;

  return {
    timestamp: Date.now(),
    endpoints: nextEndpoints,
    transactions: nextTransactions,
    pool: {
      status: healthyCount === nextEndpoints.length ? 'healthy' : degradedCount > 0 ? 'degraded' : 'unhealthy',
      healthyCount,
      degradedCount,
      unhealthyCount: nextEndpoints.length - healthyCount - degradedCount,
    },
    alerts: degradedCount > 0 ? [
      { id: 'triton-slow', message: 'Triton endpoint latency exceeded 1500ms threshold', severity: 'warning' }
    ] : [],
  };
}

export function useMetricsSocket() {
  const [metrics, setMetrics] = useState<MetricsFrame | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const receivedWsFrame = useRef<boolean>(false);

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let fallbackTimeout: NodeJS.Timeout;
    let simulationInterval: NodeJS.Timeout;
    let tickCount = 0;

    function startClientSimulation() {
      let currentFrame: MetricsFrame = {
        timestamp: Date.now(),
        endpoints: JSON.parse(JSON.stringify(initialEndpoints)),
        transactions: JSON.parse(JSON.stringify(initialTransactions)),
        pool: {
          status: 'healthy',
          healthyCount: 4,
          degradedCount: 0,
          unhealthyCount: 0,
        },
        alerts: [],
      };

      setMetrics(currentFrame);

      simulationInterval = setInterval(() => {
        tickCount++;
        currentFrame = generateMockFrame(tickCount, currentFrame.endpoints, currentFrame.transactions);
        setMetrics(currentFrame);
      }, 1000);
    }

    function connect() {
      try {
        const socket = new WebSocket('ws://localhost:3001');

        socket.onopen = () => {
          setConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data) as MetricsFrame;
            receivedWsFrame.current = true;
            
            // If simulation was running, clear it and use live WS feed
            if (simulationInterval) {
              clearInterval(simulationInterval);
            }
            if (fallbackTimeout) {
              clearTimeout(fallbackTimeout);
            }

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

    // Set 5-second timeout to fall back to simulation if no WS data is received
    fallbackTimeout = setTimeout(() => {
      if (!receivedWsFrame.current) {
        console.log('No WebSocket daemon found after 5s. Falling back to client-side simulation.');
        startClientSimulation();
      }
    }, 5000);

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (simulationInterval) clearInterval(simulationInterval);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  return { metrics, connected };
}
