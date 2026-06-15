import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from '../src/SimulationEngine.js';
import {
  buildComputeBudgetInstructions,
  createSetComputeUnitLimitInstruction,
  createSetComputeUnitPriceInstruction,
} from '../src/ComputeBudgetBuilder.js';

describe('SimulationEngine and ComputeBudgetBuilder', () => {
  it('SimulationEngine estimates compute units with buffer and clamps successfully', async () => {
    const mockRpc = {
      simulateTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: {
            unitsConsumed: 10000, // 10k consumed
          },
        }),
      }),
    };

    const engine = new SimulationEngine(mockRpc);
    const units = await engine.estimateComputeUnits('dummy_wire_tx');
    // 10,000 * 1.1 = 11,000
    expect(units).toBe(11000);
  });

  it('SimulationEngine clamps values to [1000, 1400000]', async () => {
    // 1. Below floor
    const mockRpcLow = {
      simulateTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: { unitsConsumed: 50 },
        }),
      }),
    };
    const engineLow = new SimulationEngine(mockRpcLow);
    const unitsLow = await engineLow.estimateComputeUnits('dummy_wire_tx');
    expect(unitsLow).toBe(1000); // clamped to floor

    // 2. Above ceiling
    const mockRpcHigh = {
      simulateTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: { unitsConsumed: 2000000 },
        }),
      }),
    };
    const engineHigh = new SimulationEngine(mockRpcHigh);
    const unitsHigh = await engineHigh.estimateComputeUnits('dummy_wire_tx');
    expect(unitsHigh).toBe(1400000); // clamped to ceiling
  });

  it('SimulationEngine falls back to 200,000 on RPC simulation errors', async () => {
    const mockRpcFail = {
      simulateTransaction: vi.fn().mockReturnValue({
        send: vi.fn().mockRejectedValue(new Error('Simulation failed')),
      }),
    };

    const engine = new SimulationEngine(mockRpcFail);
    const units = await engine.estimateComputeUnits('dummy_wire_tx');
    expect(units).toBe(200000);
  });

  it('ComputeBudgetBuilder creates correct instructions', () => {
    const limitInstruction = createSetComputeUnitLimitInstruction(150000);
    expect(limitInstruction.programAddress.toString()).toBe('ComputeBudget111111111111111111111111111111');
    expect(limitInstruction.data).toHaveLength(5);
    expect(limitInstruction.data![0]).toBe(2); // code 2

    const priceInstruction = createSetComputeUnitPriceInstruction(5000n);
    expect(priceInstruction.programAddress.toString()).toBe('ComputeBudget111111111111111111111111111111');
    expect(priceInstruction.data).toHaveLength(9);
    expect(priceInstruction.data![0]).toBe(3); // code 3

    const { setComputeUnitLimit, setComputeUnitPrice } = buildComputeBudgetInstructions({
      microlamportsPerCu: 8000,
      estimatedLamportsCost: 0n,
      source: 'test',
      confidence: 'high',
      computeUnitsEstimate: 250000,
    });

    expect(setComputeUnitLimit.data![0]).toBe(2);
    // read u32 from limit data
    const limitView = new DataView(setComputeUnitLimit.data!.buffer);
    expect(limitView.getUint32(1, true)).toBe(250000);

    expect(setComputeUnitPrice.data![0]).toBe(3);
    // read u64 from price data
    const priceView = new DataView(setComputeUnitPrice.data!.buffer);
    expect(priceView.getBigUint64(1, true)).toBe(8000n);
  });
});
