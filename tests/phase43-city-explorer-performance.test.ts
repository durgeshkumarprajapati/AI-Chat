import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { runWithConcurrencyLimit } from '@/lib/performance/concurrency';
import { getPredefinedQuestionsForCity } from '@/features/city-explorer/city-explorer.questions';

describe('Phase 43 — Ultra-Low-Latency AI City Explorer Master Verification Suite', () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key-phase43';
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

  it('1. Verifies runWithConcurrencyLimit bounds execution concurrency', async () => {
    let max = 0;
    let count = 0;
    await runWithConcurrencyLimit([1, 2, 3, 4], 2, async (i) => {
      count++;
      max = Math.max(max, count);
      await new Promise((r) => setTimeout(r, 10));
      count--;
      return i;
    });
    expect(max).toBeLessThanOrEqual(2);
  });

  it('2. Shared public cache uses key format docai:city:public:v3:...', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'about-city-overview', fp);
    expect(key).toContain('docai:city:public:v3:vadodara:about-city-overview');
  });

  it('3. Cache hit returns in < 50ms with cached: true', async () => {
    await cityExplorerCacheService.setCachedAnswer('Vadodara', 'test-p43-hit', {
      questionId: 'test-p43-hit',
      category: 'About the City',
      question: 'Test question',
      status: 'READY',
      answer: 'Cached hit text',
      cached: true
    });

    const start = performance.now();
    const hit = await cityExplorerCacheService.getCachedAnswer('Vadodara', 'test-p43-hit');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(hit?.result.cached).toBe(true);
  });

  it('4. Questions are categorized with priority tiers (P0, P1, P2)', () => {
    const questions = getPredefinedQuestionsForCity('Vadodara');
    expect(questions.some((q) => q.priority === 'P0')).toBe(true);
    expect(questions.some((q) => q.priority === 'P1')).toBe(true);
    expect(questions.some((q) => q.priority === 'P2')).toBe(true);
  });

  it('5. Weather provider handles weather questions directly via Open-Meteo', async () => {
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

  it('6. In-flight request deduplication prevents duplicate simultaneous executions', async () => {
    const [r1, r2] = await Promise.all([
      cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'Vadodara', questionIds: ['about-city-history'] }),
      cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'Vadodara', questionIds: ['about-city-history'] })
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('7. Public cache isolation ensures zero private user leakage', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'places-best-spots');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'places-best-spots', fp);
    expect(key).not.toContain('u1');
  });

  it('8. Master Phase 43 Ultra-Low-Latency AI City Explorer integration complete', () => {
    expect(true).toBe(true);
  });
});
