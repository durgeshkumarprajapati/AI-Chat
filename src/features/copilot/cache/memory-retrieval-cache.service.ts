import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { RankedMemory } from '../memory/copilot-memory.types';

/**
 * Phase 90 — memory-retrieval result cache.
 *
 * A DIFFERENT cache from the existing `copilot-cache.service.ts` (which caches full
 * `CopilotExecutionResult`s for the unrelated single-shot Copilot orchestrator) — this one caches
 * only ranked-memory-retrieval result lists, keyed by user+project+query hash.
 *
 * Mirrors `knowledge-graph-cache.service.ts`'s exact try-Redis-then-in-memory-Map-with-TTL shape.
 * Invalidation: Redis has no built-in pattern-delete, but `src/lib/redis.ts` already exposes
 * `delByPattern` (non-blocking SCAN-based) — reused here directly rather than inventing a second
 * mechanism. The in-memory layer keeps its own per-process key set and is swept by string-prefix
 * match on invalidation, same as `knowledge-graph-cache.service.ts.clearUserCache`.
 */
export class MemoryRetrievalCacheService {
  private inMemoryCache: Map<string, { data: RankedMemory[]; expiresAt: number }> = new Map();

  public buildCacheKey(userId: string, projectId: string | null | undefined, queryText?: string): string {
    const hash = createHash('sha256').update((queryText || '').toLowerCase().trim()).digest('hex');
    return `copilot:memory:v1:user:${userId}:project:${projectId || 'none'}:q:${hash}`;
  }

  public async get(key: string): Promise<RankedMemory[] | null> {
    try {
      const cached = await redis.getJson<RankedMemory[]>(key);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to the in-memory layer.
    }

    const mem = this.inMemoryCache.get(key);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.data;
    }
    return null;
  }

  public async set(key: string, data: RankedMemory[], ttlSeconds: number): Promise<void> {
    this.inMemoryCache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });

    try {
      await redis.setJson(key, data, ttlSeconds);
    } catch {
      // Best-effort only — never throw on a cache-write failure.
    }
  }

  /**
   * Invalidates every cached retrieval result for a user (optionally scoped to one project).
   * Never throws — a failed invalidation just means a stale cache entry expires naturally via TTL.
   */
  public async invalidate(userId: string, projectId?: string | null): Promise<void> {
    const pattern = projectId
      ? `copilot:memory:v1:user:${userId}:project:${projectId}:*`
      : `copilot:memory:v1:user:${userId}:*`;

    for (const k of Array.from(this.inMemoryCache.keys())) {
      if (this.matchesPrefix(k, userId, projectId)) {
        this.inMemoryCache.delete(k);
      }
    }

    try {
      await redis.delByPattern(pattern);
    } catch {
      // Best-effort — Redis being unavailable never fails the caller's write operation.
    }
  }

  private matchesPrefix(key: string, userId: string, projectId?: string | null): boolean {
    const userPrefix = `copilot:memory:v1:user:${userId}:`;
    if (!key.startsWith(userPrefix)) return false;
    if (!projectId) return true;
    return key.startsWith(`${userPrefix}project:${projectId}:`);
  }

  public clearInMemoryCache(): void {
    this.inMemoryCache.clear();
  }
}

export const memoryRetrievalCacheService = new MemoryRetrievalCacheService();
