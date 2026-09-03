/**
 * Phase 91.9 — TEI embedding provider. Self-contained (mocks global fetch, no Prisma/env import
 * chain), matching WorkerOllamaEmbeddingProvider's own validation contract exactly since both
 * implement the same EmbeddingProvider interface consumed by embedding.service.ts.
 */
import { WorkerTEIEmbeddingProvider } from '../../../worker/src/embeddings/tei.embedding.provider';

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (async () => ([])),
    text: response.text ?? (async () => '')
  }) as any;
}

describe('WorkerTEIEmbeddingProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws a clear error immediately when TEI_BASE_URL is not configured (never silently falls back)', async () => {
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: '' });
    await expect(provider.embedTexts(['hello'])).rejects.toThrow('requires TEI_BASE_URL to be configured');
  });

  it('returns validated vectors for a well-formed batch response', async () => {
    mockFetchOnce({ ok: true, json: async () => [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]] });
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080', expectedDimensions: 3, maxRetries: 0 });

    const result = await provider.embedTexts(['chunk one', 'chunk two']);

    expect(result).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/embed',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ inputs: ['chunk one', 'chunk two'] }) })
    );
  });

  it('rejects a response whose vector count does not match the input text count', async () => {
    mockFetchOnce({ ok: true, json: async () => [[0.1, 0.2, 0.3]] });
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080', expectedDimensions: 3, maxRetries: 0 });

    await expect(provider.embedTexts(['a', 'b'])).rejects.toThrow('count mismatch');
  });

  it('rejects a vector whose dimension does not match the configured pgvector-compatible dimension', async () => {
    mockFetchOnce({ ok: true, json: async () => [[0.1, 0.2]] }); // 2 dims, expecting 768 (the schema's fixed dimension)
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080', expectedDimensions: 768, maxRetries: 0 });

    await expect(provider.embedTexts(['a'])).rejects.toThrow('dimension mismatch');
  });

  it('rejects a vector containing a non-finite value', async () => {
    mockFetchOnce({ ok: true, json: async () => [[0.1, Number.NaN, 0.3]] });
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080', expectedDimensions: 3, maxRetries: 0 });

    await expect(provider.embedTexts(['a'])).rejects.toThrow('Invalid vector value');
  });

  it('never calls the network for an empty input array', async () => {
    global.fetch = jest.fn();
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080' });

    const result = await provider.embedTexts([]);

    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries a transient (5xx) failure and eventually succeeds', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      call++;
      if (call === 1) {
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      }
      return { ok: true, status: 200, json: async () => [[0.1, 0.2]] };
    }) as any;

    const provider = new WorkerTEIEmbeddingProvider({
      baseUrl: 'http://localhost:8080',
      expectedDimensions: 2,
      maxRetries: 2,
      initialDelayMs: 1
    });

    const result = await provider.embedTexts(['a']);
    expect(result).toEqual([[0.1, 0.2]]);
    expect(call).toBe(2);
  });

  it('does not retry a non-retryable error (e.g. a dimension mismatch)', async () => {
    mockFetchOnce({ ok: true, json: async () => [[0.1]] });
    const provider = new WorkerTEIEmbeddingProvider({ baseUrl: 'http://localhost:8080', expectedDimensions: 768, maxRetries: 3, initialDelayMs: 1 });

    await expect(provider.embedTexts(['a'])).rejects.toThrow('dimension mismatch');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
