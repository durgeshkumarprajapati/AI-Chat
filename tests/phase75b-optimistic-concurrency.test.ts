import { configService } from '@/features/config/config.service';
import { ConflictError } from '@/errors';

import { configCacheService } from '@/features/config/config-cache.service';

describe('Phase 75B — Optimistic Concurrency Control (Versioning)', () => {
  it('increments version on update and throws 409 Conflict for stale versions', async () => {
    configCacheService.clearMemory();
    const key = 'MEETING_ANALYSIS_TIMEOUT_MS';
    const current = await configService.get(key);
    expect(current).not.toBeNull();
    const startVersion = current!.version;

    // Successful update with matching expected version
    const updated = await configService.updateConfig(key, {
      value: '16000',
      expectedVersion: startVersion
    });

    expect(updated.version).toBe(startVersion + 1);

    // Stale version update attempt MUST throw 409 ConflictError!
    await expect(
      configService.updateConfig(key, {
        value: '17000',
        expectedVersion: startVersion // Stale!
      })
    ).rejects.toThrow(ConflictError);

    // Clean up
    await configService.updateConfig(key, {
      value: current!.value
    });
  });
});
