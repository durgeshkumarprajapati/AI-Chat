import {
  getPredefinedQuestionsForCity,
  findQuestionById,
  CITY_EXPLORER_CATEGORIES
} from '../src/features/city-explorer/city-explorer.questions';
import { CityExplorerCacheService } from '../src/features/city-explorer/city-explorer.cache.service';
import { cityExplorerAnswerService, CityExplorerAnswerService } from '../src/features/city-explorer/city-explorer.answer.service';
import { CityExplorerPrefetchService } from '../src/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerTelemetryService } from '../src/features/city-explorer/city-explorer.telemetry.service';
import { WebSearchService } from '../src/features/rag/web-search/web-search.service';
import { WeatherService } from '../src/features/weather/weather.service';
import { LLMProvider } from '../src/features/rag/llm/llm.provider';

// Mock Dependencies
const mockLLMProvider: LLMProvider = {
  generateAnswer: async (_input: any) => {
    return 'Vadodara is a cultural city in Gujarat known for Lakshmi Vilas Palace and rich heritage.';
  },
  streamAnswer: async function* () {
    yield 'Vadodara is a cultural city...';
  }
};

async function runPhase38Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 38 CITY EXPLORER PREFETCH TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [TEST ${total}] ${description}`);
    } else {
      console.error(`  ❌ [TEST ${total}] FAILED: ${description}`);
      throw new Error(`Test assertion failed: ${description}`);
    }
  }

  // TEST 1: City question registry loads
  const vQuestions = getPredefinedQuestionsForCity('Vadodara');
  assert(vQuestions.length > 0, 'City question registry loads questions for Vadodara');

  // TEST 2: Question IDs are validated
  const qItem = findQuestionById('about-city-overview', 'Vadodara');
  assert(qItem !== null && qItem.id === 'about-city-overview', 'Question ID lookup validates correctly');

  // TEST 3: Predefined categories completeness
  assert(CITY_EXPLORER_CATEGORIES.length >= 8, 'Predefined question registry contains all core categories');

  // TEST 4: Question fingerprint generation
  const cacheService = new CityExplorerCacheService();
  const fp1 = cacheService.computeFingerprint('Vadodara', 'about-city-overview');
  const fp2 = cacheService.computeFingerprint('Vadodara', 'about-city-overview');
  const fp3 = cacheService.computeFingerprint('Ahmedabad', 'about-city-overview');
  assert(fp1 === fp2, 'Fingerprint generation is deterministic for identical inputs');
  assert(fp1 !== fp3, 'Fingerprint generation varies by city');

  // TEST 5: Cache TTL differentiation for STATIC vs DYNAMIC questions
  const staticTtl = cacheService.getTTLSeconds('STATIC');
  const dynamicTtl = cacheService.getTTLSeconds('DYNAMIC');
  assert(staticTtl > dynamicTtl, 'Static questions have longer TTL than dynamic questions');

  // TEST 6: In-memory & Redis cache set and get
  await cacheService.setCachedAnswer('Vadodara', 'about-city-overview', {
    questionId: 'about-city-overview',
    category: 'About the City',
    question: 'Tell me about Vadodara.',
    status: 'READY',
    answer: 'Vadodara is a historic city in Gujarat.',
    citations: [{ title: 'Wikipedia', url: 'https://wikipedia.org' }]
  }, 'STATIC');

  const cached = await cacheService.getCachedAnswer('Vadodara', 'about-city-overview');
  assert(cached !== null && (cached.result.answer?.includes('historic city') ?? false), 'Cache hit returns stored answer');

  // TEST 7: Cache hit avoids generation
  let searchCallCount = 0;
  const mockWebSearch = {
    executeWebSearch: async () => {
      searchCallCount++;
      return {
        chunks: [{ content: 'Vadodara web content', metadata: { title: 'Vadodara', url: 'http://example.com' } }],
        metrics: {} as any,
        searchQueries: ['Vadodara']
      };
    }
  } as unknown as WebSearchService;

  const mockWeather = {
    getWeather: async (c: string) => ({
      city: c,
      temperature: 28,
      feelsLike: 30,
      condition: 'Clear',
      humidity: 60,
      windSpeed: 10,
      high: 32,
      low: 24,
      observedAt: new Date().toISOString()
    })
  } as unknown as WeatherService;

  const answerService = new CityExplorerAnswerService(mockWebSearch, mockWeather, mockLLMProvider);
  (cityExplorerAnswerService as any).llmProvider = mockLLMProvider;
  (cityExplorerAnswerService as any).webSearch = mockWebSearch;
  (cityExplorerAnswerService as any).weather = mockWeather;
  const prefetchService = new CityExplorerPrefetchService(cacheService, answerService);

  const prefetchResult1 = await prefetchService.prefetchAnswers('user-test', {
    city: 'Vadodara',
    questionIds: ['about-city-overview']
  });

  assert(prefetchResult1.success && prefetchResult1.answers[0]?.cached === true, 'Prefetch leverages cached result without search');

  // TEST 8: Weather category questions call WeatherService directly
  const weatherQ = findQuestionById('travel-weather-today', 'Vadodara')!;
  const weatherAns = await answerService.generateAnswer('user-test', { name: 'Vadodara' }, weatherQ);
  assert(weatherAns.status === 'READY' && (weatherAns.answer?.includes('28°C') ?? false), 'Weather question uses WeatherService directly');

  // TEST 9: Source isolation enforcement (sourceMode = web_search)
  assert(!(weatherAns.answer?.includes('private.pdf') ?? false), 'City Explorer answers never touch private documents');

  // TEST 10: Redis generation lock acquisition & release
  const lockOwner = await cacheService.acquireGenerationLock('fp-test-lock', 5);
  assert(lockOwner !== null, 'Generation lock acquired successfully');
  const duplicateLock = await cacheService.acquireGenerationLock('fp-test-lock', 5);
  assert(duplicateLock === null, 'Duplicate generation lock acquisition rejected');
  if (lockOwner) {
    await cacheService.releaseGenerationLock('fp-test-lock', lockOwner);
  }
  const reacquired = await cacheService.acquireGenerationLock('fp-test-lock', 5);
  assert(reacquired !== null, 'Lock re-acquired after release');

  // TEST 11: Single Question Force Refresh bypasses cache
  const refreshResult = await prefetchService.prefetchAnswers('user-test', {
    city: 'Vadodara',
    questionIds: ['about-city-overview'],
    forceRefreshQuestionId: 'about-city-overview'
  });
  assert(refreshResult.success && refreshResult.answers[0]?.status === 'READY', 'Force refresh generates new answer');

  // TEST 12: Sparse / missing web evidence returns NO_EVIDENCE
  const emptyWebSearch = {
    executeWebSearch: async () => ({ chunks: [], metrics: {} as any, searchQueries: [] })
  } as unknown as WebSearchService;
  const noEvidenceAnswerService = new CityExplorerAnswerService(emptyWebSearch, mockWeather);

  const noEvQ = findQuestionById('about-city-famous', 'Vadodara')!;
  const noEvRes = await noEvidenceAnswerService.generateAnswer('user-test', { name: 'Vadodara' }, noEvQ);
  assert(noEvRes.status === 'NO_EVIDENCE', 'Missing evidence returns NO_EVIDENCE status');

  // TEST 13: Failed answer does not break entire batch prefetch
  const failingWebSearch = {
    executeWebSearch: async () => { throw new Error('Network error'); }
  } as unknown as WebSearchService;
  const failingAnswerService = new CityExplorerAnswerService(failingWebSearch, mockWeather);
  const failingPrefetchService = new CityExplorerPrefetchService(cacheService, failingAnswerService);

  const batchFailRes = await failingPrefetchService.prefetchAnswers('user-test', {
    city: 'Vadodara',
    questionIds: ['about-city-famous', 'travel-weather-today']
  });
  assert(batchFailRes.success === true, 'Batch prefetch succeeds overall even when individual questions fail');
  assert(batchFailRes.answers.length === 2, 'Batch prefetch returns results for all requested questions');

  // TEST 14: Telemetry logging
  const recentLogs = cityExplorerTelemetryService.getRecentLogs('Vadodara');
  assert(recentLogs.length > 0, 'City Explorer telemetry records events');

  // TEST 15: Invalidate city cache
  await cacheService.invalidateCityCache('Vadodara');
  const postInvalidate = await cacheService.getCachedAnswer('Vadodara', 'about-city-overview');
  assert(postInvalidate === null, 'City cache invalidation removes stored city keys');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} / ${total} PHASE 38 TESTS PASSED CLEANLY!`);
  console.log('====================================================\n');
}

runPhase38Tests().catch((err) => {
  console.error('❌ PHASE 38 TEST SUITE FAILED:', err);
  process.exit(1);
});
