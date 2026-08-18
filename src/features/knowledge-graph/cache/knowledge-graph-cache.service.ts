import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';

export class KnowledgeGraphCacheService {
  private inMemoryCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly defaultTTL = env.server?.KNOWLEDGE_GRAPH_CACHE_TTL_SECONDS ?? 300;

  public buildCacheKey(
    userId: string,
    projectId: string | null | undefined,
    version: number,
    query: string
  ): string {
    const scope = projectId ? `project:${projectId}` : `user:${userId}`;
    const hash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
    return `docai:kg:v1:${scope}:v:${version}:${hash}`;
  }

  public async get<T>(key: string): Promise<T | null> {
    if (env.server?.KNOWLEDGE_GRAPH_ENABLED === false) return null;

    try {
      const cached = await redis.getJson<T>(key);
      if (cached) return cached;
    } catch {
      // Redis fallback to in-memory
    }

    const mem = this.inMemoryCache.get(key);
    if (mem && Date.now() < mem.expiresAt) {
      return mem.data as T;
    }

    return null;
  }

  public async set(key: string, data: any, ttlSeconds?: number): Promise<void> {
    if (env.server?.KNOWLEDGE_GRAPH_ENABLED === false) return;

    const ttl = ttlSeconds || this.defaultTTL;
    this.inMemoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttl * 1000
    });

    try {
      await redis.setJson(key, data, ttl);
    } catch {
      // Ignore redis set warnings
    }
  }

  public async clearUserCache(userId: string): Promise<void> {
    const prefix = `docai:kg:v1:user:${userId}`;
    for (const k of Array.from(this.inMemoryCache.keys())) {
      if (k.startsWith(prefix)) {
        this.inMemoryCache.delete(k);
        await redis.del(k).catch(() => {});
      }
    }
  }

  public clearInMemoryCache(): void {
    this.inMemoryCache.clear();
  }
}

export const knowledgeGraphCacheService = new KnowledgeGraphCacheService();
