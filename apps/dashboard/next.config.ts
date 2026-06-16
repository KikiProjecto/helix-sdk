import type { NextConfig } from "next";

const phase = process.env.NEXT_PHASE;
const isServer = phase === 'phase-production-server' || phase === 'phase-development-server';
if (isServer && typeof window === 'undefined') {
  const serverPath = './src/lib/metricsServer';
  import(serverPath).catch(() => {});
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
