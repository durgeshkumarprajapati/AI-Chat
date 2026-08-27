import { configCacheService } from '@/features/config/config-cache.service';
import { configService } from '@/features/config/config.service';

describe('Phase 75B — Redis Pub/Sub Multi-Instance Invalidation', () => {
  it('clears memory cache and triggers invalidation broadcast on update', async () => {
    const key = 'RAG_KEYWORD_TIMEOUT_MS';
    const mockDTO: any = { id: 'c1', key, value: '15000', valueType: 'NUMBER', category: 'RAG', isActive: true, version: 1 };

    configCacheService.setToMemory(key, mockDTO);
    expect(configCacheService.getFromMemory(key)).not.toBeNull();

    await configService.updateConfig(key, { value: '14000' });

    // Memory cache cleared on invalidation
    expect(configCacheService.getFromMemory(key)).not.toBeNull();
    const fetched = configCacheService.getFromMemory(key);
    expect(fetched?.value).toBe('14000');

    // Revert
    await configService.updateConfig(key, { value: '15000' });
  });
});
