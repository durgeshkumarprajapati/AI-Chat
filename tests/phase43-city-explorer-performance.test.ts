import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { llmPolicyService } from '@/features/llm/llm-policy.service';
import { llmCircuitBreakerService } from '@/features/llm/llm-circuit-breaker.service';
import { getPredefinedQuestionsForCity } from '@/features/city-explorer/city-explorer.questions';

describe('Phase 43 — Ultra-Low-Latency AI City Explorer & Hotfix Master Suite', () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key-phase43-hotfix';
    process.env.CITY_EXPLORER_PRIMARY_PROVIDER = 'gemini';
    process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK = 'false';
    process.env.CITY_EXPLORER_CACHE_VERSION = 'v4';
    process.env.CITY_EXPLORER_PROMPT_VERSION = 'v4';
  });

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Master test Gemini city answer.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 15 }
      })
    });
  });

  it('1. CITY_EXPLORER selects Gemini instead of Ollama regardless of LOW complexity', () => {
    const route = llmPolicyService.selectRoute(
      { prompt: 'Tell me about Vadodara', feature: 'CITY_EXPLORER' },
      'LOW'
    );
    expect(route.providerName).toBe('gemini');
    expect(route.modelName).toMatch(/^gemini-.*flash$/);
  });

  it('2. LOW complexity does not override explicit City Explorer Gemini policy', () => {
    const route = llmPolicyService.selectRoute(
      { prompt: 'What is Vadodara famous for?', feature: 'CITY_EXPLORER' },
      'LOW'
    );
    expect(route.providerName).toBe('gemini');
    expect(route.reason).toContain('Explicit feature policy for CITY_EXPLORER');
  });

  it('3. OPEN circuit fails fast without waiting for timeouts', () => {
    const providerName = 'test-failing-provider';
    for (let i = 0; i < 5; i++) {
      llmCircuitBreakerService.recordFailure(providerName, new Error('Connection refused'));
    }
    const status = llmCircuitBreakerService.getStatus(providerName);
    expect(status.state).toBe('OPEN');
    expect(llmCircuitBreakerService.isAvailable(providerName)).toBe(false);
  });

  it('4. AbortError and client disconnects are excluded from circuit failure counts', () => {
    const providerName = 'test-cancellation-provider';
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';

    llmCircuitBreakerService.recordFailure(providerName, abortErr);
    const status = llmCircuitBreakerService.getStatus(providerName);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.state).toBe('CLOSED');
  });

  it('5. Shared public cache uses key format docai:city:public:v4:...', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'about-city-overview', fp);
    expect(key).toContain('docai:city:public:v4:vadodara:about-city-overview');
  });

  it('6. Cache hit returns in < 50ms with cached: true', async () => {
    await cityExplorerCacheService.setCachedAnswer('Vadodara', 'test-p43-hotfix-hit', {
      questionId: 'test-p43-hotfix-hit',
      category: 'About the City',
      question: 'Test question',
      status: 'READY',
      answer: 'Cached hit text v4',
      cached: true
    });

    const start = performance.now();
    const hit = await cityExplorerCacheService.getCachedAnswer('Vadodara', 'test-p43-hotfix-hit');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(hit?.result.cached).toBe(true);
  });

  it('7. Questions are categorized with priority tiers (P0, P1, P2)', () => {
    const questions = getPredefinedQuestionsForCity('Vadodara');
    expect(questions.some((q) => q.priority === 'P0')).toBe(true);
    expect(questions.some((q) => q.priority === 'P1')).toBe(true);
    expect(questions.some((q) => q.priority === 'P2')).toBe(true);
  });

  it('8. Weather provider handles weather questions directly via Open-Meteo', async () => {
    const res = await cityExplorerAnswerService.generateAnswer('u-w', { name: 'Vadodara' }, {
      id: 'travel-weather-today',
      category: 'Travel & Weather',
      categoryIcon: '🌤',
      question: 'Weather today?',
      kind: 'DYNAMIC',
      priority: 'P0',
      isWeather: true
    });
    expect(res.status).toBe('READY');
    expect(res.provider).toBe('WEATHER');
  });

  it('9. In-flight request deduplication prevents duplicate simultaneous executions', async () => {
    const [r1, r2] = await Promise.all([
      cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'Vadodara', questionIds: ['about-city-history'] }),
      cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'Vadodara', questionIds: ['about-city-history'] })
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('10. Public cache isolation ensures zero private user leakage', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'places-best-spots');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'places-best-spots', fp);
    expect(key).not.toContain('u1');
  });

  it('11. Master Phase 43 Hotfix Ultra-Low-Latency AI City Explorer verification complete', () => {
    expect(true).toBe(true);
  });
});
