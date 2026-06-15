import { IInstruction, address } from '@solana/web3.js';
import { FeeEstimate } from './types.js';

export const COMPUTE_BUDGET_PROGRAM_ADDRESS = address('ComputeBudget111111111111111111111111111111');

/**
 * Creates a standard SetComputeUnitLimit instruction under web3.js v2.0
 */
export function createSetComputeUnitLimitInstruction(units: number): IInstruction {
  const data = new Uint8Array(5);
  const dataView = new DataView(data.buffer);
  dataView.setUint8(0, 2); // Code 2 = SetComputeUnitLimit
  dataView.setUint32(1, units, true);

  return {
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    data,
  };
}

/**
 * Creates a standard SetComputeUnitPrice instruction under web3.js v2.0
 */
export function createSetComputeUnitPriceInstruction(microLamports: bigint | number): IInstruction {
  const data = new Uint8Array(9);
  const dataView = new DataView(data.buffer);
  dataView.setUint8(0, 3); // Code 3 = SetComputeUnitPrice
  dataView.setBigUint64(1, BigInt(microLamports), true);

  return {
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    data,
  };
}

/**
 * Builds standard compute budget limit and price instruction pairs for transaction messages.
 */
export function buildComputeBudgetInstructions(
  estimate: FeeEstimate,
  defaultUnits = 200000
): {
  setComputeUnitLimit: IInstruction;
  setComputeUnitPrice: IInstruction;
} {
  const units = estimate.computeUnitsEstimate ?? defaultUnits;
  return {
    setComputeUnitLimit: createSetComputeUnitLimitInstruction(units),
    setComputeUnitPrice: createSetComputeUnitPriceInstruction(estimate.microlamportsPerCu),
  };
}
