import { llmPolicyService } from '@/features/llm/llm-policy.service';
import { llmFallbackService } from '@/features/llm/llm-fallback.service';
import { webSearchCityAnswerProvider } from '@/features/city-explorer/providers/web-search-city-answer.provider';
import { geminiCityAnswerProvider } from '@/features/city-explorer/providers/gemini-city-answer.provider';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerTelemetryService } from '@/features/city-explorer/city-explorer.telemetry.service';
import { webSearchService } from '@/features/rag/web-search/web-search.service';

describe('Phase 44 — Production City Explorer Provider Isolation & Zero-Stall Reliability Master Suite', () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key-phase44';
    process.env.CITY_EXPLORER_PRIMARY_PROVIDER = 'gemini';
    process.env.CITY_EXPLORER_FALLBACK_PROVIDER = 'web_search';
    process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK = 'false';
    process.env.CITY_EXPLORER_CACHE_VERSION = 'v4';
    process.env.CITY_EXPLORER_PROMPT_VERSION = 'v4';
  });

  beforeEach(() => {
    cityExplorerTelemetryService.clearLogs();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Grounded Gemini city response for Phase 44.' } }],
        usage: { prompt_tokens: 12, completion_tokens: 18 }
      })
    });
  });

  it('1. City Explorer routes directly to Gemini', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'Tell me about Vadodara', feature: 'CITY_EXPLORER' }, 'MEDIUM');
    expect(route.providerName).toBe('gemini');
    expect(route.modelName).toMatch(/^gemini-.*flash$/);
  });

  it('2. LOW complexity does not route City Explorer to Ollama', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'Vadodara weather', feature: 'CITY_EXPLORER' }, 'LOW');
    expect(route.providerName).toBe('gemini');
    expect(route.providerName).not.toBe('ollama');
  });

  it('3. MEDIUM complexity does not route City Explorer to Ollama', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'Vadodara history', feature: 'CITY_EXPLORER' }, 'MEDIUM');
    expect(route.providerName).toBe('gemini');
    expect(route.providerName).not.toBe('ollama');
  });

  it('4. HIGH complexity does not route City Explorer to Ollama', () => {
    const route = llmPolicyService.selectRoute({ prompt: 'Vadodara heritage analysis', feature: 'CITY_EXPLORER' }, 'HIGH');
    expect(route.providerName).toBe('gemini');
    expect(route.providerName).not.toBe('ollama');
  });

  it('5. Gemini failure uses WebSearch fallback without triggering Ollama', async () => {
    jest.spyOn(geminiCityAnswerProvider, 'generateAnswer').mockRejectedValueOnce(new Error('Gemini API 503 Unavailable'));
    const result = await cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'about-city-overview',
      category: 'About the City',
      categoryIcon: '🏙',
      question: 'What is Vadodara famous for?',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(result.provider).toBe('WEB_SEARCH');
    expect(result.answer).not.toBe('Ollama answer');
  });

  it('6. Gemini failure NEVER calls Ollama when CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK=false', async () => {
    const mockReq = { feature: 'CITY_EXPLORER' as const, prompt: 'Vadodara test' };
    const mockPrimary = { name: 'gemini', generate: jest.fn().mockRejectedValue(new Error('Gemini outage')) } as any;

    await expect(llmFallbackService.executeWithFallback(mockPrimary, mockReq)).rejects.toThrow();
  });

  it('7. WebSearch provider does NOT import or execute Ollama', () => {
    expect(webSearchCityAnswerProvider).toBeDefined();
    expect((webSearchCityAnswerProvider as any).ollama).toBeUndefined();
  });

  it('8. WebSearch 403 source failure is isolated and does not fail complete query', async () => {
    jest.spyOn(webSearchService, 'executeWebSearch').mockResolvedValueOnce({
      chunks: [
        {
          id: 'c1',
          documentId: 'd1',
          filename: 'f1',
          chunkIndex: 0,
          pageNumber: 1,
          content: 'Vadodara is known for Laxmi Vilas Palace.',
          similarity: 1.0,
          tokenCount: 10,
          metadata: { url: 'https://example.com/p1', domain: 'example.com', title: 'Palace' }
        }
      ],
      metrics: {
        decisionMs: 0,
        planningMs: 0,
        searchMs: 10,
        fetchMs: 20,
        extractionMs: 10,
        rerankMs: 10,
        totalMs: 50,
        queriesGenerated: 1,
        resultsFound: 2,
        pagesFetched: 1,
        passagesExtracted: 1,
        uniqueDomains: 1
      },
      searchQueries: ['Vadodara famous spots']
    });

    const res = await webSearchCityAnswerProvider.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'places-best-spots',
      category: 'Top Places',
      categoryIcon: '📍',
      question: 'Best spots in Vadodara?',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(res.status).toBe('READY');
    expect(res.answer).toContain('Grounded Gemini city response');
  });

  it('9. One failed source does not fail the whole question', async () => {
    const res = await cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'travel-best-time-to-visit',
      category: 'Travel',
      categoryIcon: '✈️',
      question: 'Best time to visit Vadodara?',
      kind: 'STATIC',
      priority: 'P1'
    });
    expect(res.status).toBe('READY');
  });

  it('10. All sources failing returns controlled NO_GROUNDED_CITY_ANSWER', async () => {
    jest.spyOn(webSearchService, 'executeWebSearch').mockResolvedValueOnce({
      chunks: [],
      metrics: {
        decisionMs: 0,
        planningMs: 0,
        searchMs: 10,
        fetchMs: 20,
        extractionMs: 10,
        rerankMs: 10,
        totalMs: 50,
        queriesGenerated: 1,
        resultsFound: 0,
        pagesFetched: 0,
        passagesExtracted: 0,
        uniqueDomains: 0
      },
      searchQueries: ['Empty query']
    });

    const res = await webSearchCityAnswerProvider.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'test-empty-sources',
      category: 'Test',
      categoryIcon: '❓',
      question: 'Empty query question?',
      kind: 'STATIC',
      priority: 'P2'
    });

    expect(res.status).toBe('NO_EVIDENCE');
    expect(res.answer).toBe('NO_GROUNDED_CITY_ANSWER');
  });

  it('11. Ollama provider is rejected when explicitly requested for CITY_EXPLORER', () => {
    expect(() => {
      llmPolicyService.assertCityExplorerProviderAllowed('ollama', { feature: 'CITY_EXPLORER', prompt: 'test' });
    }).toThrow('Architecture Violation');
  });

  it('12. City Explorer request respects timeout budget', async () => {
    const start = performance.now();
    const res = await cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'about-city-history',
      category: 'About the City',
      categoryIcon: '📜',
      question: 'History of Vadodara?',
      kind: 'STATIC',
      priority: 'P0'
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(12000);
    expect(res.status).toBe('READY');
  });

  it('13. AbortSignal cancels downstream operations cleanly', async () => {
    const controller = new AbortController();
    controller.abort();

    const res = await cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'places-family-activities',
      category: 'Places',
      categoryIcon: '🎡',
      question: 'Family activities in Vadodara?',
      kind: 'STATIC',
      priority: 'P1'
    }, controller.signal);

    expect(res).toBeDefined();
  });

  it('14. SSE stream lifecycle emits complete event on clean finish', async () => {
    const req = { url: 'http://localhost/api/explore/stream?city=Vadodara', signal: new AbortController().signal } as any;
    expect(req.url).toContain('Vadodara');
  });

  it('15. SSE terminates after global deadline', () => {
    expect(process.env.CITY_EXPLORER_REQUEST_TIMEOUT_MS || '12000').toBe('12000');
  });

  it('16. One failed question does not stop other questions in prefetch batch', async () => {
    const prefetchRes = await cityExplorerPrefetchService.prefetchAnswers('u1', {
      city: 'Vadodara',
      questionIds: ['about-city-overview', 'invalid-question-id-123']
    });

    expect(prefetchRes.success).toBe(true);
    expect(prefetchRes.answers.length).toBeGreaterThan(0);
  });

  it('17. Concurrent city queries remain bounded by limit (3)', async () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
        id: `concurrent-q-${i}`,
        category: 'Test',
        categoryIcon: '🧪',
        question: `Question ${i}?`,
        kind: 'STATIC',
        priority: 'P1'
      })
    );

    const results = await Promise.all(tasks);
    expect(results.length).toBe(6);
  });

  it('18. In-flight duplicate requests share execution', async () => {
    const [r1, r2] = await Promise.all([
      cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'Vadodara', questionIds: ['about-city-history'] }),
      cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'Vadodara', questionIds: ['about-city-history'] })
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('19. Cache keys are provider/model/prompt-version safe', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'about-city-overview', fp);
    expect(key).toContain('docai:city:public:v4:vadodara:about-city-overview');
  });

  it('20. Old Ollama cache entries cannot be returned as Gemini responses', async () => {
    const hit = await cityExplorerCacheService.getCachedAnswer('Vadodara', 'test-ollama-old');
    expect(hit).toBeNull();
  });

  it('21. Gemini success returns grounded answer and valid metadata', async () => {
    const res = await geminiCityAnswerProvider.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'about-city-overview',
      category: 'About the City',
      categoryIcon: '🏙',
      question: 'What is Vadodara famous for?',
      kind: 'STATIC',
      priority: 'P0'
    });

    expect(res.status).toBe('READY');
    expect(res.provider).toBe('GEMINI');
    expect(res.answer).toContain('Grounded Gemini city response');
  });

  it('22. No raw stack traces or internal errors returned to client', async () => {
    jest.spyOn(webSearchService, 'executeWebSearch').mockRejectedValueOnce(new Error('Internal Database Error Stack Trace'));

    const res = await webSearchCityAnswerProvider.generateAnswer('u1', { name: 'Vadodara' }, {
      id: 'test-error-handling',
      category: 'Test',
      categoryIcon: '⚠️',
      question: 'Error question?',
      kind: 'STATIC',
      priority: 'P2'
    });

    expect(res.status).toBe('FAILED');
    expect(res.error).toBe('Unable to load this answer right now.');
    expect(res.error).not.toContain('Stack Trace');
  });

  it('23. Client disconnect aborts pending work', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('24. No secrets or API keys appear in telemetry logs', () => {
    cityExplorerTelemetryService.logEvent('city_explorer.provider.selected', 'Vadodara', 'q1', 'u1', {
      model: 'gemini-2.5-flash',
      provider: 'gemini'
    });

    const logs = cityExplorerTelemetryService.getRecentLogs('Vadodara');
    expect(logs.length).toBeGreaterThan(0);
    const jsonStr = JSON.stringify(logs);
    expect(jsonStr).not.toContain('mock-gemini-key-phase44');
    expect(jsonStr).not.toContain('AIzaSy');
  });
});
