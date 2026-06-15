
export interface FeeEstimate {
  microlamportsPerCu: number;
  estimatedLamportsCost: bigint;
  source: string;
  confidence: 'low' | 'medium' | 'high';
  computeUnitsEstimate?: number;
}

export interface FeeProvider {
  name: string;
  estimateFee(programIds: string[], abortSignal?: AbortSignal): Promise<FeeEstimate>;
}

export interface FeeOracleConfig {
  providers?: readonly FeeProvider[];   // default: [helius, native]
  fallbackMode?: 'cascade' | 'median'; // cascade = try in order; median = average all
  cacheTtlMs?: number;                  // default: 5_000
  maxMicrolamportsPerCu?: number;       // hard cap, default: 1_000_000
  minMicrolamportsPerCu?: number;       // floor, default: 1_000
}
