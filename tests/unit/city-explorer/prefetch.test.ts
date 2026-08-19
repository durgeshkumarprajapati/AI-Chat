import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';

describe('City Explorer Prefetch Service Unit Tests', () => {
  beforeEach(async () => {
    await cityExplorerCacheService.setCachedAnswer('Vadodara', 'about-city-overview', {
      questionId: 'about-city-overview',
      category: 'About the City',
      question: 'Tell me about Vadodara.',
      status: 'READY',
      answer: 'Vadodara is a cultural capital.',
      cached: true
    });
  });

  it('prefetches answers cleanly with cached entries and normalized payload', async () => {
    const payload = await cityExplorerPrefetchService.prefetchAnswers('u-prefetch', {
      city: 'Vadodara',
      questionIds: ['about-city-overview']
    });

    expect(payload.success).toBe(true);
    expect(payload.city.name).toBe('Vadodara');
    expect(payload.answers.length).toBe(1);
    expect(payload.answers[0]?.cached).toBe(true);
  });
});
