import { configCacheService } from '@/features/config/config-cache.service';
import { configService } from '@/features/config/config.service';

describe('Phase 75A — Multi-Level Cache & Instance Invalidation', () => {
  it('clears memory cache when invalidation is triggered', async () => {
    const key = 'RAG_FAST_PATH_CONFIDENCE_THRESHOLD';
    const dto: any = { id: 'c1', key, value: '0.95', valueType: 'NUMBER', category: 'RAG', isActive: true };

    configCacheService.setToMemory(key, dto);
    expect(configCacheService.getFromMemory(key)).not.toBeNull();

    await configCacheService.invalidateKey(key, false);
    expect(configCacheService.getFromMemory(key)).toBeNull();
  });

  it('updates L1 memory and L2 cache cleanly on config update', async () => {
    const key = 'RAG_VECTOR_TIMEOUT_MS';
    const original = await configService.get(key);

    const updated = await configService.updateConfig(key, { value: '18000', purpose: original?.purpose || 'Timeout' });
    expect(updated.value).toBe('18000');

    const fetched = await configService.get(key);
    expect(fetched?.value).toBe('18000');

    // Revert back
    await configService.updateConfig(key, { value: original?.value || '15000', purpose: original?.purpose || 'Timeout' });
  });
});
