// Phase 88 Part B, Task 4 — single-flight dedup added to LLMGateway.generate()'s cache-miss path
// (src/features/llm/llm-gateway.service.ts). Proves: (1) two concurrent identical requests share
// one underlying `fallback.executeWithFallback` call instead of firing it twice, (2) two
// concurrent DIFFERENT requests are NOT deduped, and (3) the returned response content is
// unaffected — dedup only removes the redundant work, never changes what's returned. Constructs
// LLMGateway directly with fully-mocked collaborators (its constructor already supports dependency
// injection) rather than jest.mock'ing modules, since every dependency LLMGateway.generate() calls
// is a constructor parameter.
import { LLMGateway } from '@/features/llm/llm-gateway.service';
import { LLMRequest, LLMResponse } from '@/features/llm/llm.types';

function buildGateway(executeWithFallback: jest.Mock) {
  const router = {
    resolveRoute: jest.fn().mockReturnValue({
      provider: {} as any,
      decision: { providerName: 'openai', modelName: 'gpt-test', complexity: 'MEDIUM', isFallback: false, reason: 'test' }
    })
  } as any;

  const cache = {
    getCachedResponse: jest.fn().mockResolvedValue(null),
    setCachedResponse: jest.fn().mockResolvedValue(undefined),
    // Dedupe key is keyed on the request prompt only, mirroring the real SHA-256 request hash's
    // sensitivity to prompt content.
    getCacheKey: jest.fn((request: LLMRequest) => `key:${request.prompt}`)
  } as any;

  const fallback = { executeWithFallback } as any;

  const tokenBudget = {
    applyTokenBudget: jest.fn((systemPrompt?: string, context?: string, prompt?: string) => ({ systemPrompt, context, prompt }))
  } as any;

  const telemetry = { recordEvent: jest.fn() } as any;
  const registry = {} as any;
  const rateLimiter = { checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, resetMs: 0 }) } as any;

  return new LLMGateway(router, cache, fallback, tokenBudget, telemetry, registry, rateLimiter);
}

function deferredResponse(response: LLMResponse, delayMs: number): Promise<{ response: LLMResponse; usedFallback: boolean }> {
  return new Promise((resolve) => setTimeout(() => resolve({ response, usedFallback: false }), delayMs));
}

describe('Phase 88 — LLMGateway single-flight dedup', () => {
  it('collapses two concurrent identical requests into one executeWithFallback call', async () => {
    const executeWithFallback = jest.fn().mockImplementation(() =>
      deferredResponse({ text: 'answer', provider: 'openai', model: 'gpt-test', tokensUsed: 10 } as any, 20)
    );
    const gateway = buildGateway(executeWithFallback);

    const req: LLMRequest = { prompt: 'What is the capital of France?', userId: 'user-1' } as any;

    const [r1, r2] = await Promise.all([gateway.generate(req), gateway.generate({ ...req })]);

    expect(executeWithFallback).toHaveBeenCalledTimes(1);
    expect(r1.text).toBe('answer');
    expect(r2.text).toBe('answer');
    expect(r1.cached).toBe(false);
    expect(r2.cached).toBe(false);
  });

  it('does NOT dedupe two concurrent requests with different prompts', async () => {
    const executeWithFallback = jest.fn().mockImplementation((_provider: unknown, request: LLMRequest) =>
      deferredResponse({ text: `answer-for:${request.prompt}`, provider: 'openai', model: 'gpt-test', tokensUsed: 10 } as any, 20)
    );
    const gateway = buildGateway(executeWithFallback);

    const [r1, r2] = await Promise.all([
      gateway.generate({ prompt: 'question A', userId: 'user-1' } as any),
      gateway.generate({ prompt: 'question B', userId: 'user-1' } as any)
    ]);

    expect(executeWithFallback).toHaveBeenCalledTimes(2);
    expect(r1.text).toBe('answer-for:question A');
    expect(r2.text).toBe('answer-for:question B');
  });

  it('a later, sequential identical request (after the first has resolved) still executes fresh work — dedup only covers genuinely concurrent in-flight requests', async () => {
    const executeWithFallback = jest.fn().mockImplementation(() =>
      deferredResponse({ text: 'answer', provider: 'openai', model: 'gpt-test', tokensUsed: 10 } as any, 5)
    );
    const gateway = buildGateway(executeWithFallback);

    const req: LLMRequest = { prompt: 'sequential question', userId: 'user-1' } as any;

    await gateway.generate(req);
    await gateway.generate({ ...req });

    expect(executeWithFallback).toHaveBeenCalledTimes(2);
  });

  it('propagates a rejection to every deduped caller without changing the error', async () => {
    const failure = new Error('provider exploded');
    const executeWithFallback = jest.fn().mockImplementation(() => Promise.reject(failure));
    const gateway = buildGateway(executeWithFallback);

    const req: LLMRequest = { prompt: 'will fail', userId: 'user-1' } as any;

    const results = await Promise.allSettled([gateway.generate(req), gateway.generate({ ...req })]);

    expect(executeWithFallback).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});
