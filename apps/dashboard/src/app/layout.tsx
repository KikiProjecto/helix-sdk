import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helix Reliability SDK · Real-Time Monitoring",
  description: "Production-grade resilience dashboard for monitoring Solana RPC pools, latency failover, and Jito bundle stats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
