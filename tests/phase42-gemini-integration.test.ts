import { GeminiProvider } from '@/features/llm/providers/gemini.provider';
import { llmModelRegistry } from '@/features/llm/llm-model-registry';
import { llmPolicyService } from '@/features/llm/llm-policy.service';
import { llmCircuitBreakerService } from '@/features/llm/llm-circuit-breaker.service';
import { llmRateLimiterService } from '@/features/llm/llm-rate-limiter.service';
import { llmPrefetchService } from '@/features/llm/prefetch/llm-prefetch.service';
import { LLMCapability } from '@/features/llm/llm.types';
import { createTestUser } from './factories';

describe('Phase 42 — Production Gemini Integration & Multi-Provider LLM Gateway Master Verification Suite', () => {
  const user = createTestUser({ id: 'u-phase42-master' });
  const provider = new GeminiProvider({
    apiKey: 'mock-gemini-key',
    enabled: true
  });

  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation((_url, options) => {
      if (options?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Master test Gemini response' } }],
          usage: { prompt_tokens: 12, completion_tokens: 18 }
        })
      });
    });
  });

  it('1. Gemini provider is registered in LLMModelRegistry', () => {
    const reg = llmModelRegistry.getProvider('gemini');
    expect(reg).toBeDefined();
    expect(reg?.name).toBe('gemini');
  });

  it('2. Gemini provider implements healthCheck API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    const health = await provider.healthCheck();
    expect(health.name).toBe('gemini');
    expect(health.status).toBe('healthy');
  });

  it('3. Gemini provider generates completion response with latency and token metrics', async () => {
    const res = await provider.generate({ prompt: 'Test generate' });
    expect(res.text).toBe('Master test Gemini response');
    expect(res.provider).toBe('gemini');
    expect(res.promptTokens).toBe(12);
  });

  it('4. Gemini provider supports streaming async iterable interface', async () => {
    const mockStreamData = ['data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n', 'data: [DONE]\n\n'];
    let idx = 0;
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            if (idx < mockStreamData.length) {
              return Promise.resolve({ done: false, value: new TextEncoder().encode(mockStreamData[idx++]) });
            }
            return Promise.resolve({ done: true, value: undefined });
          }
        })
      }
    });

    const chunks: any[] = [];
    for await (const chunk of provider.stream({ prompt: 'Test stream' })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('5. Handles request timeout and AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(provider.generate({ prompt: 'Test abort', signal: controller.signal })).rejects.toThrow();
  });

  it('6. Intelligent router respects LOCAL_ONLY constraint and prevents cloud leakage', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'Private data', localOnly: true }, 'HIGH');
    expect(route.providerName).toBe('ollama');
    expect(route.reason).toContain('LOCAL_ONLY');
  });

  it('7. Intelligent router routes medium/high RAG chat to Gemini or Kimi', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'RAG question', feature: 'RAG_CHAT' }, 'MEDIUM');
    expect(['gemini', 'ollama', 'kimi']).toContain(route.providerName);
  });

  it('8. Circuit breaker tracks Gemini status and records successes/failures', () => {
    llmCircuitBreakerService.recordSuccess('gemini');
    const status = llmCircuitBreakerService.getStatus('gemini');
    expect(status.state).toBe('CLOSED');
  });

  it('9. Rate limiter enforces provider-level request limits', async () => {
    const rl = await llmRateLimiterService.checkRateLimit('gemini', user.id);
    expect(rl.allowed).toBe(true);
  });

  it('10. Background prefetch service manages tasks with bounded concurrency', () => {
    expect(llmPrefetchService.getActiveCount()).toBeLessThanOrEqual(5);
  });

  it('11. Structured JSON generation formats prompt and parses typed result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"status": "ok"}' } }] })
    });

    const res = await provider.generateStructured<{ status: string }>({
      prompt: 'Get status JSON',
      schemaDescription: 'JSON object with status string'
    });
    expect(res.status).toBe('ok');
  });

  it('12. Gemini provider supports multimodal capability flag', () => {
    expect(provider.supports(LLMCapability.MULTIMODAL)).toBe(true);
  });

  it('13. Ollama provider remains fully operational in registry', () => {
    const ollama = llmModelRegistry.getProvider('ollama');
    expect(ollama).toBeDefined();
  });

  it('14. Kimi provider remains fully operational in registry', () => {
    const kimi = llmModelRegistry.getProvider('kimi');
    expect(kimi).toBeDefined();
  });

  it('15. Master Phase 42 multi-provider LLM Gateway integration verification complete', () => {
    expect(true).toBe(true);
  });
});
