import { configCacheService } from '@/features/config/config-cache.service';

describe('Phase 75 — Config Cache & Two-Tier Invalidation', () => {
  it('stores and retrieves configuration items from memory cache', () => {
    const mockConfig: any = {
      id: 'cfg-1',
      key: 'TEST_CACHE_KEY',
      value: '100',
      valueType: 'NUMBER',
      category: 'SYSTEM',
      purpose: 'Test caching',
      isActive: true
    };

    configCacheService.setToMemory('TEST_CACHE_KEY', mockConfig);
    const cached = configCacheService.getFromMemory('TEST_CACHE_KEY');

    expect(cached).toEqual(mockConfig);

    configCacheService.removeFromMemory('TEST_CACHE_KEY');
    expect(configCacheService.getFromMemory('TEST_CACHE_KEY')).toBeNull();
  });

  it('invalidates cache without throwing even if Redis is offline', async () => {
    await expect(configCacheService.invalidateKey('TEST_CACHE_KEY')).resolves.not.toThrow();
  });
});
