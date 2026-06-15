import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

interface EndpointMetric {
  url: string;
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyP50Ms: number;
  latencyP99Ms: number;
  requestsPerMin: number;
  history: number[];
}

interface TransactionMetric {
  signature: string;
  status: 'confirmed' | 'dropped' | 'retried';
  latencyMs: number;
  source: 'Jito' | 'RPC';
  fee: string;
  timeAgo: string;
}

const server = createServer();
const wss = new WebSocketServer({ server });

server.on('error', (err: unknown) => {
  const error = err as Error & { code?: string };
  if (error.code === 'EADDRINUSE') {
    console.log('Metrics WebSocket server port 3001 already in use, skipping.');
  } else {
    console.error('HTTP server error:', error);
  }
});

server.listen(3001, () => {
  console.log('Metrics WebSocket server running on port 3001');
});

// Setup mock endpoints
const endpoints: EndpointMetric[] = [
  { url: 'https://mainnet.helius-rpc.com', name: 'Helius', status: 'healthy', latencyP50Ms: 47, latencyP99Ms: 112, requestsPerMin: 1204, history: Array(30).fill(47) },
  { url: 'https://solana-mainnet.quiknode.pro', name: 'QuickNode', status: 'healthy', latencyP50Ms: 82, latencyP99Ms: 198, requestsPerMin: 892, history: Array(30).fill(82) },
  { url: 'https://ssc-dao.genesysgo.net', name: 'Triton', status: 'healthy', latencyP50Ms: 120, latencyP99Ms: 250, requestsPerMin: 512, history: Array(30).fill(120) },
  { url: 'https://api.mainnet-beta.solana.com', name: 'Public', status: 'healthy', latencyP50Ms: 234, latencyP99Ms: 689, requestsPerMin: 312, history: Array(30).fill(234) },
];

const transactions: TransactionMetric[] = [
  { signature: '7xKm' + Math.random().toString(36).substring(2, 10) + '4pQr', status: 'confirmed', latencyMs: 47, source: 'Jito', fee: '0.000012 SOL', timeAgo: '2s ago' },
  { signature: '3bNp' + Math.random().toString(36).substring(2, 10) + '9wXs', status: 'confirmed', latencyMs: 120, source: 'RPC', fee: '0.000008 SOL', timeAgo: '4s ago' },
  { signature: '2mYt' + Math.random().toString(36).substring(2, 10) + '7kPl', status: 'retried', latencyMs: 340, source: 'RPC', fee: '0.000015 SOL', timeAgo: '6s ago' },
];

let tickCount = 0;

setInterval(() => {
  tickCount++;

  // 1. Simulating RPC dynamic metrics
  endpoints.forEach((ep) => {
    // Add small random noise
    const noise = Math.floor(Math.random() * 10 - 5);
    
    // Trigger signature animation: Triton degrades occasionally on loop
    if (ep.name === 'Triton') {
      if (tickCount % 20 >= 15) {
        // Degraded phase
        ep.status = 'degraded';
        ep.latencyP50Ms = 1847 + noise;
        ep.latencyP99Ms = 4200 + noise;
        ep.requestsPerMin = Math.max(10, ep.requestsPerMin - 80);
      } else {
        // Healthy phase
        ep.status = 'healthy';
        ep.latencyP50Ms = 120 + noise;
        ep.latencyP99Ms = 250 + noise;
        ep.requestsPerMin = 512 + noise;
      }
    } else {
      ep.latencyP50Ms = Math.max(10, ep.latencyP50Ms + noise);
      ep.latencyP99Ms = Math.max(20, ep.latencyP99Ms + noise * 2);
      ep.requestsPerMin = Math.max(100, ep.requestsPerMin + Math.floor(Math.random() * 20 - 10));
    }

    // Keep history clean (last 30 slots)
    ep.history.push(ep.latencyP50Ms);
    if (ep.history.length > 30) ep.history.shift();
  });

  // 2. Add a new transaction periodically
  if (Math.random() > 0.4) {
    const isJito = Math.random() > 0.4;
    const isDropped = Math.random() > 0.95;
    const isRetried = !isDropped && Math.random() > 0.85;
    const status = isDropped ? 'dropped' : isRetried ? 'retried' : 'confirmed';

    const source = isJito ? 'Jito' : 'RPC';
    const latency = isDropped ? 0 : isJito ? Math.floor(Math.random() * 30 + 40) : Math.floor(Math.random() * 150 + 60);
    const charList = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const randomSig = Array.from({ length: 12 }, () => charList[Math.floor(Math.random() * charList.length)]).join('');

    transactions.unshift({
      signature: randomSig.substring(0, 4) + '...' + randomSig.substring(8, 12),
      status,
      latencyMs: latency,
      source,
      fee: isJito ? '0.000012 SOL' : '0.000005 SOL',
      timeAgo: 'Just now',
    });

    if (transactions.length > 50) {
      transactions.pop();
    }
  }

  // Update timeAgo for existing transactions
  transactions.forEach((tx, idx) => {
    if (idx > 0) {
      tx.timeAgo = `${idx * 2}s ago`;
    }
  });

  // 3. Compute pool metrics
  const healthyCount = endpoints.filter((e) => e.status === 'healthy').length;
  const degradedCount = endpoints.filter((e) => e.status === 'degraded').length;

  const payload = JSON.stringify({
    timestamp: Date.now(),
    endpoints,
    transactions,
    pool: {
      status: healthyCount === endpoints.length ? 'healthy' : degradedCount > 0 ? 'degraded' : 'unhealthy',
      healthyCount,
      degradedCount,
      unhealthyCount: endpoints.length - healthyCount - degradedCount,
    },
    alerts: degradedCount > 0 ? [
      { id: 'triton-slow', message: 'Triton endpoint latency exceeded 1500ms threshold', severity: 'warning' }
    ] : [],
  });

  // Broadcast to all connected WebSockets
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 1000);
