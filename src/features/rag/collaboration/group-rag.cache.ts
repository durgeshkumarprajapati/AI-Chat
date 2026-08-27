import crypto from 'crypto';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { OrchestratedAnswer } from '../orchestration/answer-orchestrator.types';

export class GroupRagCacheService {
  public generateCacheKey(
    tenantId: string,
    conversationId: string,
    sourceVersionHash: string,
    query: string
  ): string {
    const queryHash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').substring(0, 16);
    return `rag:group:tenant:${tenantId}:conversation:${conversationId}:sources:${sourceVersionHash}:query:${queryHash}`;
  }

  public async getCachedAnswer(key: string): Promise<OrchestratedAnswer | null> {
    if (!env.server?.GROUP_RAG_CACHE_ENABLED) {
      return null;
    }
    try {
      const cached = await redis.getJson<OrchestratedAnswer>(key);
      if (cached) {
        return {
          ...cached,
          cacheHit: true,
          cacheType: 'exact'
        };
      }
      return null;
    } catch (error) {
      console.warn('[GroupRagCache] Cache read error, skipping cache:', error);
      return null;
    }
  }

  public async setCachedAnswer(key: string, answer: OrchestratedAnswer): Promise<void> {
    if (!env.server?.GROUP_RAG_CACHE_ENABLED) {
      return;
    }
    try {
      const ttl = env.server?.GROUP_RAG_CACHE_TTL_SECONDS ?? 300;
      await redis.setJson(key, answer, ttl);
    } catch (error) {
      console.warn('[GroupRagCache] Cache write error:', error);
    }
  }

  public async invalidateGroupCache(conversationId: string): Promise<void> {
    if (!env.server?.GROUP_RAG_CACHE_ENABLED) {
      return;
    }
    try {
      const pattern = `rag:group:*:conversation:${conversationId}:*`;
      const client = await redis.getClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      console.warn(`[GroupRagCache] Cache invalidation error for conversation ${conversationId}:`, error);
    }
  }
}

export const groupRagCacheService = new GroupRagCacheService();
