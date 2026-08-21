import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';

describe('In-Flight Request Deduplication Unit Tests', () => {
  jest.setTimeout(15000);

  it('deduplicates identical simultaneous city question prefetch requests', async () => {
    const [res1, res2] = await Promise.all([
      cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'Vadodara', questionIds: ['about-city-famous'] }),
      cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'Vadodara', questionIds: ['about-city-famous'] })
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.answers[0]?.questionId).toBe('about-city-famous');
    expect(res2.answers[0]?.questionId).toBe('about-city-famous');
  });
});
