import type { NextConfig } from "next";

const phase = process.env.NEXT_PHASE;
const isServer = phase === 'phase-production-server' || phase === 'phase-development-server';
if (isServer && typeof window === 'undefined') {
  import('./src/lib/metricsServer').catch(() => {});
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
