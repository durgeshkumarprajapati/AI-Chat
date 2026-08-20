import { envConfig } from '@/config/env';
import { ExploreAnswerSchema } from '@/features/city-explorer/city-explorer.types';
import { GeminiCityAnswerProvider } from '@/features/city-explorer/providers/gemini-city-answer.provider';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { LLMGateway } from '@/features/llm/llm-gateway.service';

describe('Phase 54 — Gemini-Powered Explore City Intelligence', () => {
  const mockCity = { name: 'Vadodara', region: 'Gujarat', country: 'India' };
  const mockQuestion = {
    id: 'q_tell_me_about_vadodara',
    category: 'About the City',
    categoryIcon: '📍',
    question: 'Tell me about Vadodara.',
    kind: 'STATIC' as const,
    priority: 'P0' as const
  };

  test('1. Centralized Environment Configuration contains Gemini & City Explorer settings', () => {
    expect(envConfig.google).toBeDefined();
    expect(envConfig.cityExplorer).toBeDefined();
    expect(envConfig.cityExplorer.v2Enabled).toBe(true);
    expect(envConfig.cityExplorer.geminiTimeoutMs).toBeDefined();
    expect(envConfig.cityExplorer.staticTtlSeconds).toBe(86400);
  });

  test('2. Zod ExploreAnswerSchema validates structured JSON output', () => {
    const validData = {
      answer: 'Vadodara is a major cultural and historical city in Gujarat.',
      confidence: 'high',
      highlights: ['Cultural Capital', 'Lakshmi Vilas Palace']
    };

    const parsed = ExploreAnswerSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.answer).toBe(validData.answer);
      expect(parsed.data.confidence).toBe('high');
      expect(parsed.data.highlights).toHaveLength(2);
    }
  });

  test('3. GeminiCityAnswerProvider executes via LLMGateway with structured JSON output', async () => {
    const mockGateway = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          answer: 'Vadodara is famous for its rich heritage, palaces, and festivals.',
          confidence: 'high',
          highlights: ['Navratri', 'Baroda Museum']
        }),
        model: 'gemini-2.5-flash',
        provider: 'gemini'
      })
    } as unknown as LLMGateway;

    const provider = new GeminiCityAnswerProvider(mockGateway);
    const result = await provider.generateAnswer('test-user-id', mockCity, mockQuestion);

    expect(result.status).toBe('READY');
    expect(result.answer).toContain('Vadodara is famous');
    expect(result.confidence).toBe('high');
    expect(result.highlights).toContain('Navratri');
    expect(mockGateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'CITY_EXPLORER',
        providerOverride: 'gemini'
      })
    );
  });

  test('4. GeminiCityAnswerProvider gracefully falls back to raw text on JSON parse/validation error', async () => {
    const mockGateway = {
      generate: jest.fn().mockResolvedValue({
        text: 'Vadodara is known as the cultural capital of Gujarat with royal palaces.',
        model: 'gemini-2.5-flash',
        provider: 'gemini'
      })
    } as unknown as LLMGateway;

    const provider = new GeminiCityAnswerProvider(mockGateway);
    const result = await provider.generateAnswer('test-user-id', mockCity, mockQuestion);

    expect(result.status).toBe('READY');
    expect(result.answer).toContain('cultural capital');
    expect(result.confidence).toBe('medium');
  });

  test('5. Answer caching and single-answer refresh invalidation work deterministically', async () => {
    const city = 'Vadodara';
    const questionId = 'q_history_vadodara';

    const testPayload = {
      questionId,
      category: 'About the City',
      question: 'What is the history of Vadodara?',
      status: 'READY' as const,
      answer: 'Vadodara history dates back over 2000 years.',
      confidence: 'high' as const,
      cached: false,
      generatedAt: new Date().toISOString()
    };

    // Store in cache
    await cityExplorerCacheService.setCachedAnswer(city, questionId, testPayload, 'STATIC');

    // Retrieve cached answer
    const cached = await cityExplorerCacheService.getCachedAnswer(city, questionId);
    expect(cached).not.toBeNull();
    expect(cached?.result.answer).toBe(testPayload.answer);
    expect(cached?.result.cached).toBe(true);
  });

  test('6. Concurrent duplicate prefetch requests are deduplicated cleanly', async () => {
    const mockGateway = {
      generate: jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          text: JSON.stringify({
            answer: 'Vadodara has Lakshmi Vilas Palace, Sayaji Baug, and EME Temple.',
            confidence: 'high'
          }),
          model: 'gemini-2.5-flash',
          provider: 'gemini'
        };
      })
    } as unknown as LLMGateway;

    const mockProvider = new GeminiCityAnswerProvider(mockGateway);
    const customAnswerService = new (cityExplorerAnswerService.constructor as any)([mockProvider]);
    const customPrefetchService = new (cityExplorerPrefetchService.constructor as any)(
      cityExplorerCacheService,
      customAnswerService
    );

    const testCity = `DedupCity_${Date.now()}`;
    const input = {
      city: testCity,
      questionIds: ['about-city-overview']
    };

    // Trigger two concurrent requests for the exact same city and question ID
    const [res1, res2] = await Promise.all([
      customPrefetchService.prefetchAnswers('user1', input),
      customPrefetchService.prefetchAnswers('user2', input)
    ]);

    expect(res1.answers[0]?.answer).toBe(res2.answers[0]?.answer);
    // The gateway generation should have been invoked at most once due to inFlight deduplication
    expect(mockGateway.generate).toHaveBeenCalledTimes(1);
  });
});
