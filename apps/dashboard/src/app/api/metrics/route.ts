import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.HELIX_METRICS_TOKEN;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format' }, { status: 401 });
  }

  const token = authHeader.substring(7);

  // If token is configured, check it. Otherwise allow in dev/debug mode
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }

  // Return standard mock metrics snapshot for verification
  return NextResponse.json({
    "helix.rpc.latency_ms": 47.5,
    "helix.rpc.error_rate": 0.02,
    "helix.rpc.success_rate": 0.98,
    "helix.rpc.requests_total": 12450,
    "helix.tx.confirmation_time_ms": 1240,
    "helix.tx.send_attempts": 1,
    "helix.tx.retry_count": 0,
    "helix.tx.dropped_count": 0,
    "helix.pool.healthy_nodes": 4,
    "helix.pool.degraded_nodes": 0,
    "timestamp": Date.now()
  });
}
