import { redis } from '@/lib/redis';
import { configService } from '@/features/config/config.service';
import { SnapshotDTO, SnapshotType } from '../types/ai-intelligence.types';

/**
 * Mirrors KnowledgeGraphCacheService's exact try-Redis-then-in-memory-Map shape
 * (src/features/knowledge-graph/cache/knowledge-graph-cache.service.ts) — `redis.getJson`/
 * `setJson`/`del` throw on Redis unavailability with no built-in fallback, so every call here is
 * wrapped in try/catch and backed by an in-memory Map as a second-tier cache.
 */
export class AiIntelligenceCacheService {
  private inMemoryCache: Map<string, { data: SnapshotDTO; expiresAt: number }> = new Map();

  public buildCacheKey(userId: string, projectId: string | null, type: SnapshotType, periodKey: string): string {
    return projectId
      ? `ai:intelligence:v1:user:${userId}:project:${projectId}:type:${type}:period:${periodKey}`
      : `ai:intelligence:v1:user:${userId}:type:${type}:period:${periodKey}`;
  }

  public async get(key: string): Promise<SnapshotDTO | null> {
    try {
      const cached = await redis.getJson<SnapshotDTO>(key);
      if (cached) return cached;
    } catch {
      // Redis fallback to in-memory
    }

    const mem = this.inMemoryCache.get(key);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.data;
    }

    return null;
  }

  public async set(key: string, data: SnapshotDTO, ttlSecondsOverride?: number): Promise<void> {
    const ttl = ttlSecondsOverride ?? (await configService.getNumber('AI_INTELLIGENCE_CACHE_TTL_SECONDS', 300));

    this.inMemoryCache.set(key, { data, expiresAt: Date.now() + ttl * 1000 });

    try {
      await redis.setJson(key, data, ttl);
    } catch {
      // best-effort; in-memory tier already set above
    }
  }

  public async invalidate(key: string): Promise<void> {
    this.inMemoryCache.delete(key);
    try {
      await redis.del(key);
    } catch {
      // best-effort
    }
  }

  public clearInMemoryCache(): void {
    this.inMemoryCache.clear();
  }
}

export const aiIntelligenceCacheService = new AiIntelligenceCacheService();
