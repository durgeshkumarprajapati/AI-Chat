import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';

describe('In-Flight Request Deduplication Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deduplicates identical simultaneous city question prefetch requests', async () => {
    jest.spyOn(cityExplorerCacheService, 'getCachedAnswer').mockResolvedValue(null);

    let callCount = 0;
    jest.spyOn(cityExplorerAnswerService, 'generateAnswer').mockImplementation(async (_userId, _cityInfo, qItem) => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        questionId: qItem.id,
        category: qItem.category,
        question: qItem.question,
        status: 'READY',
        answer: 'Deduplicated mock answer',
        cached: false,
        generatedAt: new Date().toISOString()
      };
    });

    const [res1, res2] = await Promise.all([
      cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'DedupeTestCity', questionIds: ['about-city-famous'] }),
      cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'DedupeTestCity', questionIds: ['about-city-famous'] })
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.answers[0]?.questionId).toBe('about-city-famous');
    expect(res2.answers[0]?.questionId).toBe('about-city-famous');
    expect(callCount).toBe(1);
  });
});
