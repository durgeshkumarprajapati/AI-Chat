import { redis } from '@/lib/redis';

/**
 * Bumped manually if the DTO shape (GraphExplorerResponseDTO) ever changes. Not tied to any real
 * per-document/per-graph version counter — see the class doc comment for why a TTL is the
 * pragmatic answer here instead.
 */
const GRAPH_VERSION = 1;

/**
 * Mirrors `KnowledgeGraphCacheService`'s try-Redis-then-in-memory-Map-fallback shape exactly
 * (src/features/knowledge-graph/cache/knowledge-graph-cache.service.ts), scoped to the Explorer's
 * own new cache namespace (`kg:explorer:v1:*`) so it never collides with or invalidates the
 * existing KG cache (`docai:kg:v1:*`).
 *
 * KNOWN LIMITATION (documented, not a bug): the existing `KnowledgeGraphCacheService` clears its
 * `docai:kg:v1:user:*` keys whenever the underlying graph changes (job enqueue), but there is no
 * equivalent invalidation hook wired into this new cache — building a second cross-cutting
 * invalidation bus was out of scope for this pass. A short TTL (`KG_EXPLORER_CACHE_TTL_SECONDS`,
 * default 120s) is the pragmatic additive answer: a stale Explorer view can persist for at most
 * one TTL window after the underlying graph changes.
 */
export class KgExplorerCacheService {
  private inMemoryCache: Map<string, { data: unknown; expiresAt: number }> = new Map();

  public buildCacheKey(
    scope: string,
    scopeId: string,
    queryHash: string,
    depth: number,
    filtersHash: string
  ): string {
    return `kg:explorer:v1:${scope}:${scopeId}:${queryHash}:${depth}:${filtersHash}:v${GRAPH_VERSION}`;
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.getJson<T>(key);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to the in-memory fallback below.
    }

    const mem = this.inMemoryCache.get(key);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.data as T;
    }
    if (mem) {
      this.inMemoryCache.delete(key);
    }
    return null;
  }

  public async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    const ttl = ttlSeconds > 0 ? ttlSeconds : 120;
    this.inMemoryCache.set(key, { data, expiresAt: Date.now() + ttl * 1000 });

    try {
      await redis.setJson(key, data, ttl);
    } catch {
      // Best-effort — never throw on a cache-write failure.
    }
  }

  public clearInMemoryCache(): void {
    this.inMemoryCache.clear();
  }
}

export const kgExplorerCacheService = new KgExplorerCacheService();
