import type { NextConfig } from "next";

const phase = process.env.NEXT_PHASE;
const isServer = phase === 'phase-production-server' || phase === 'phase-development-server';
const isVercel = !!process.env.VERCEL;

if (isServer && typeof window === 'undefined' && !isVercel) {
  const serverPath = './src/lib/metricsServer';
  import(serverPath).catch(() => {
    // Silently fail if server can't start (fine for Vercel)
  });
}

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 120,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.solana.com',
      },
      {
        protocol: 'https',
        hostname: '**.helius-rpc.com',
      },
    ],
  },
};

export default nextConfig;
