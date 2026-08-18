export class NetworkAccessError extends Error {
  constructor(url: string) {
    super(`[NETWORK SAFETY GUARD] Blocked unexpected external network request to: "${url}". All external HTTP calls must be mocked in tests.`);
    this.name = 'NetworkAccessError';
  }
}

export function installNetworkSafetyGuard(allowedDomains: string[] = ['127.0.0.1', 'localhost']): () => void {
  const originalFetch = global.fetch;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    try {
      const parsed = new URL(urlStr);
      const isAllowed = allowedDomains.some((d) => parsed.hostname.includes(d));
      if (!isAllowed) {
        throw new NetworkAccessError(urlStr);
      }
    } catch (err) {
      if (err instanceof NetworkAccessError) throw err;
      // If URL parsing fails or non-standard URL, fail safely
      throw new NetworkAccessError(urlStr);
    }

    if (originalFetch) {
      return originalFetch(input, init);
    }

    throw new NetworkAccessError(urlStr);
  };

  return () => {
    global.fetch = originalFetch;
  };
}
