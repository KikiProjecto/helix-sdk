export class SimulationEngine {
  constructor(private readonly rpcClient: any) {}

  /**
   * Simulates transaction execution to calculate actual compute units consumed.
   * Applies a 10% safety buffer and clamps the value to [1,000, 1,400,000].
   * Falls back to a standard 200,000 CU limit if simulation fails or returns no value.
   * @param wireTxBase64 Serialized transaction base64 wire bytes.
   * @param abortSignal Optional abort signal to cancel simulation.
   */
  public async estimateComputeUnits(
    wireTxBase64: string,
    abortSignal?: AbortSignal
  ): Promise<number> {
    try {
      const res = await this.rpcClient.simulateTransaction(wireTxBase64, {
        encoding: 'base64',
        sigVerify: false,
        replaceRecentBlockhash: true,
      }).send({ abortSignal });

      if (res.value?.err) {
        throw new Error(`Simulation failed on-chain: ${JSON.stringify(res.value.err)}`);
      }

      const consumed = res.value?.unitsConsumed;
      if (typeof consumed !== 'number') {
        return 200000; // Default standard fallback
      }

      // Apply 10% buffer
      const budgeted = Math.ceil(consumed * 1.1);
      // Clamp to [1_000, 1_400_000]
      return Math.max(1000, Math.min(1400000, budgeted));
    } catch (err) {
      // Fallback to standard 200k on simulation error to remain resilient
      return 200000;
    }
  }
}
