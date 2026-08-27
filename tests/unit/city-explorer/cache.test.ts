import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';

describe('City Explorer Cache Service Unit Tests', () => {
  it('computes stable SHA-256 fingerprint for city questions', () => {
    const fp1 = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview', 'WEB_PUBLIC');
    const fp2 = cityExplorerCacheService.computeFingerprint('vadodara ', 'about-city-overview', 'WEB_PUBLIC');
    expect(fp1).toBe(fp2);
  });

  it('constructs shared public Redis cache keys docai:city:public:v3:...', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'about-city-overview', fp);
    expect(key).toContain('docai:city:public:');
    expect(key).toContain('vadodara:about-city-overview');
  });

  it('stores and retrieves cached public city answers', async () => {
    await cityExplorerCacheService.setCachedAnswer('Vadodara', 'test-q1', {
      questionId: 'test-q1',
      category: 'About the City',
      question: 'Test question',
      status: 'READY',
      answer: 'Cached answer text',
      cached: true
    });

    const cached = await cityExplorerCacheService.getCachedAnswer('Vadodara', 'test-q1');
    expect(cached).toBeDefined();
    expect(cached?.result.answer).toBe('Cached answer text');
  });
});
