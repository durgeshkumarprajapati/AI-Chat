import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { OrchestratedAnswer } from '@/features/rag/orchestration/answer-orchestrator.types';
import crypto from 'crypto';

export class ProjectRagCacheService {
  public generateCacheKey(
    tenantId: string,
    projectId: string,
    conversationId: string,
    sourceVersionHash: string,
    query: string
  ): string {
    const queryHash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').substring(0, 16);
    return `rag:project:tenant:${tenantId}:project:${projectId}:conversation:${conversationId}:sources:${sourceVersionHash}:query:${queryHash}`;
  }

  public async getCachedAnswer(key: string): Promise<OrchestratedAnswer | null> {
    if (!env.server?.PROJECT_RAG_CACHE_ENABLED) {
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
      console.warn('[ProjectRagCache] Cache read error, skipping cache:', error);
      return null;
    }
  }

  public async setCachedAnswer(key: string, answer: OrchestratedAnswer): Promise<void> {
    if (!env.server?.PROJECT_RAG_CACHE_ENABLED) {
      return;
    }
    try {
      const ttl = env.server?.PROJECT_RAG_CACHE_TTL_SECONDS ?? 300;
      await redis.setJson(key, answer, ttl);
    } catch (error) {
      console.warn('[ProjectRagCache] Cache write error:', error);
    }
  }

  public async invalidateProjectCache(projectId: string): Promise<void> {
    if (!env.server?.PROJECT_RAG_CACHE_ENABLED) {
      return;
    }
    try {
      const pattern = `rag:project:*:project:${projectId}:*`;
      const client = await redis.getClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      console.warn(`[ProjectRagCache] Cache invalidation error for project ${projectId}:`, error);
    }
  }
}

export const projectRagCacheService = new ProjectRagCacheService();
