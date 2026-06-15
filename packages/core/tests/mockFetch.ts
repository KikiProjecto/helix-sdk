export interface MockEndpointState {
  url: string;
  status: number;
  latencyMs: number;
  slotResponse: number;
  blockhashResponse?: { blockhash: string; lastValidBlockHeight: number };
  errorResponse?: string;
  callCount: number;
}

/**
 * Mocks globalThis.fetch to intercept Solana JSON-RPC requests.
 * Allows simulating network dropouts, status code failures (429, 503), latency spikes, and slot progression.
 * @param endpoints Mock states for monitored endpoints.
 * @returns A restore function to revert globalThis.fetch.
 */
export function setupMockFetch(endpoints: MockEndpointState[]): () => void {
  const originalFetch = globalThis.fetch;

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const urlStr = input.toString();
    const state = endpoints.find((e) => urlStr.startsWith(e.url));

    if (!state) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found in mock' },
          id: 1,
        }),
        { status: 404 }
      );
    }

    state.callCount++;

    // 1. Simulate Latency + Abort Signal
    if (state.latencyMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve();
        }, state.latencyMs);

        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(
              init.signal?.reason ??
                new DOMException('The operation was aborted.', 'AbortError')
            );
          });
        }
      });
    }

    if (init?.signal?.aborted) {
      throw (
        init.signal.reason ??
        new DOMException('The operation was aborted.', 'AbortError')
      );
    }

    // 2. Simulate Status Failures (e.g., 429 Too Many Requests, 503 Service Unavailable)
    if (state.status !== 200) {
      return new Response(state.errorResponse ?? 'Mock Error', {
        status: state.status,
        headers:
          state.status === 429 ? { 'Retry-After': '1' } : undefined,
      });
    }

    // 3. Process JSON-RPC request body
    const bodyText = init?.body ? String(init.body) : '';
    let req: { method: string; id?: number };
    try {
      req = JSON.parse(bodyText);
    } catch {
      return new Response('Invalid JSON RPC Request', { status: 400 });
    }

    const method = req.method;
    const id = req.id ?? 1;

    let result: unknown;

    switch (method) {
      case 'getSlot':
        result = state.slotResponse;
        break;
      case 'getLatestBlockhash':
        result = {
          context: { slot: state.slotResponse },
          value: {
            blockhash:
              state.blockhashResponse?.blockhash ??
              '11111111111111111111111111111111',
            lastValidBlockHeight:
              state.blockhashResponse?.lastValidBlockHeight ?? 1000,
          },
        };
        break;
      case 'getBlockHeight':
        result = state.slotResponse;
        break;
      case 'sendTransaction':
        result =
          'mock_signature_1111111111111111111111111111111111111111111111111111111111111111';
        break;
      case 'getSignatureStatuses':
        result = {
          context: { slot: state.slotResponse },
          value: [
            {
              confirmationStatus: 'confirmed',
              confirmations: null,
              err: null,
              slot: state.slotResponse,
              status: { Ok: null },
            },
          ],
        };
        break;
      default:
        result = {};
    }

    return new Response(JSON.stringify({ jsonrpc: '2.0', result, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  globalThis.fetch = mockFetch as any;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
