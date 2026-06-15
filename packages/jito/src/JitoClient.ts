import { AccountRole, Address, IInstruction, address } from '@solana/web3.js';
import { TipOracle } from './TipOracle.js';
import { BundleTracker } from './BundleTracker.js';
import { JitoClientConfig, JitoBundle, BundleResult, JitoEndpoint } from './types.js';
import { encodeBase58 } from './base58.js';

export const JITO_ENDPOINTS: Record<JitoEndpoint, string> = {
  mainnet: 'https://mainnet.block-engine.jito.wtf',
  ny: 'https://ny.mainnet.block-engine.jito.wtf',
  amsterdam: 'https://amsterdam.mainnet.block-engine.jito.wtf',
  frankfurt: 'https://frankfurt.mainnet.block-engine.jito.wtf',
  tokyo: 'https://tokyo.mainnet.block-engine.jito.wtf',
  dallas: 'https://dallas.mainnet.block-engine.jito.wtf',
};

export const DEFAULT_TIP_ACCOUNTS: Address[] = [
  address('96gYZGLnJYVFihjz7UkAH556C6nwyGPK6F5iY4HLY3bS'),
  address('HFqU5x63VT4T865dB4XXBKQLue7p5vA7G5xAT2s91N83'),
  address('Cw8CFyM99Hi25DKhyJmwbHLRebhWwixdrdLYGbfK17nP'),
  address('ADa6tN612Di6Q6idd7WtkKs17xs1prLfbgSTrvtH7hyy'),
  address('DttWaJVXVT61AwnDxV6zHCbsJjUp5rn9mX4G6mqJTTtY'),
  address('3AVi9UTGStbeJot6f8tCtJm18q12dB9t1wTSRg3YiSW8'),
  address('Gc71SMQCacUQ1su4gJQ5qcM5d96fbb8B587jRFnkRy2c'),
  address('FN1c1c9MdfW2mKstcKW8n4mH2FqRzSGQxUaFY3tm7n5'),
];

export class JitoClient {
  public readonly config: Required<JitoClientConfig>;
  public readonly tipOracle: TipOracle;

  constructor(config?: JitoClientConfig) {
    this.config = {
      endpoint: config?.endpoint ?? 'mainnet',
      allEndpoints: config?.allEndpoints ?? false,
      minTipLamports: config?.minTipLamports ?? 1000n,
      maxTipLamports: config?.maxTipLamports ?? 100000n,
      tipMode: config?.tipMode ?? 'fixed',
      bundleTimeout: config?.bundleTimeout ?? 30000,
      rpcFallback: config?.rpcFallback as any, // Cast to any to avoid complex type checking in circular refs
    };

    this.tipOracle = new TipOracle();
  }

  /**
   * Fetches active tip accounts from the Jito block engine.
   * Falls back to the hardcoded list on any failures.
   */
  public async getTipAccounts(abortSignal?: AbortSignal): Promise<Address[]> {
    const baseUrl = JITO_ENDPOINTS[this.config.endpoint];
    try {
      const response = await fetch(`${baseUrl}/api/v1/bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTipAccounts',
          params: [],
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(JSON.stringify(json.error));
      }

      const accounts = json.result;
      if (Array.isArray(accounts) && accounts.length > 0) {
        return accounts.map((acc: string) => address(acc));
      }
    } catch (err) {
      // Quiet fail to fallback
    }

    return DEFAULT_TIP_ACCOUNTS;
  }

  /**
   * Selects a random tip account from the active list.
   */
  public async getRandomTipAccount(abortSignal?: AbortSignal): Promise<Address> {
    const accounts = await this.getTipAccounts(abortSignal);
    const idx = Math.floor(Math.random() * accounts.length);
    return accounts[idx] ?? DEFAULT_TIP_ACCOUNTS[0]!;
  }

  /**
   * Computes the tip amount in lamports, clamping it to configured min/max range.
   */
  public async getTipAmount(abortSignal?: AbortSignal): Promise<bigint> {
    if (this.config.tipMode === 'fixed') {
      return this.config.minTipLamports;
    }

    const dynamicTip = await this.tipOracle.getRecommendedTip('p50', abortSignal);
    if (dynamicTip < this.config.minTipLamports) {
      return this.config.minTipLamports;
    }
    if (dynamicTip > this.config.maxTipLamports) {
      return this.config.maxTipLamports;
    }
    return dynamicTip;
  }

  /**
   * Creates a System transfer instruction for Jito tipping.
   */
  public async createTipInstruction(
    signer: Address,
    abortSignal?: AbortSignal
  ): Promise<{ instruction: IInstruction; tipAccount: Address; tipLamports: bigint }> {
    const tipAccount = await this.getRandomTipAccount(abortSignal);
    const tipLamports = await this.getTipAmount(abortSignal);

    const data = new Uint8Array(12);
    const dataView = new DataView(data.buffer);
    dataView.setUint32(0, 2, true); // SystemProgram.transfer index = 2
    dataView.setBigUint64(4, tipLamports, true);

    const instruction: IInstruction = {
      programAddress: address('11111111111111111111111111111111'),
      accounts: [
        { address: signer, role: AccountRole.WRITABLE_SIGNER },
        { address: tipAccount, role: AccountRole.WRITABLE },
      ],
      data,
    };

    return { instruction, tipAccount, tipLamports };
  }

  /**
   * Submits a bundle to the Jito block engine.
   * If allEndpoints is configured, tries NY, Amsterdam, Tokyo, Frankfurt, Dallas in parallel.
   */
  public async sendBundle(bundle: JitoBundle, abortSignal?: AbortSignal): Promise<BundleResult> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error('Aborted');
    }

    // Convert Base64 wire transactions to Base58
    const base58Txs = bundle.transactions.map((txBase64) => {
      const bytes = new Uint8Array(Buffer.from(txBase64, 'base64'));
      return encodeBase58(bytes);
    });

    let bundleId = '';
    const endpointsToTry: string[] = [];

    if (this.config.allEndpoints) {
      for (const url of Object.values(JITO_ENDPOINTS)) {
        endpointsToTry.push(`${url}/api/v1/bundles`);
      }
    } else {
      const baseUrl = JITO_ENDPOINTS[this.config.endpoint];
      endpointsToTry.push(`${baseUrl}/api/v1/bundles`);
    }

    try {
      if (endpointsToTry.length === 1) {
        bundleId = await this.submitBundleToEndpoint(endpointsToTry[0]!, base58Txs, abortSignal);
      } else {
        const promises = endpointsToTry.map((url) =>
          this.submitBundleToEndpoint(url, base58Txs, abortSignal)
        );
        bundleId = await Promise.any(promises);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        bundleId: '',
        status: 'rejected',
        error: `Failed to submit bundle: ${message}`,
      };
    }

    // Track the bundle status
    const trackerUrl = JITO_ENDPOINTS[this.config.endpoint];
    const tracker = new BundleTracker({
      endpointUrl: trackerUrl,
      timeoutMs: this.config.bundleTimeout,
    });

    return tracker.track(bundleId, abortSignal);
  }

  private async submitBundleToEndpoint(
    url: string,
    base58Txs: string[],
    abortSignal?: AbortSignal
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [base58Txs],
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`Jito RPC error: ${JSON.stringify(json.error)}`);
    }

    if (!json.result) {
      throw new Error('No bundleId returned from Jito block engine');
    }

    return json.result;
  }
}
