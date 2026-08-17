import { redis } from '@/lib/redis';
import { createHash } from 'crypto';

export class CopilotCacheService {
  private static readonly TTL_SECONDS = 600; // 10 minutes

  /**
   * Build isolated cache key based on user, project, conversation, query, and context scope.
   */
  public generateCacheKey(
    userId: string,
    projectId: string | undefined,
    conversationId: string | undefined,
    intent: string,
    query: string
  ): string {
    const hash = createHash('sha256')
      .update(`${userId}:${projectId || 'global'}:${conversationId || 'none'}:${intent}:${query}`)
      .digest('hex')
      .substring(0, 32);

    return `copilot:cache:${userId}:${hash}`;
  }

  public async get<T>(cacheKey: string): Promise<T | null> {
    try {
      const cached = await redis.get(cacheKey);
      if (!cached) return null;

      return JSON.parse(cached) as T;
    } catch (err) {
      console.warn('[CopilotCacheService] Cache fetch error:', err);
      return null;
    }
  }

  public async set<T>(cacheKey: string, value: T, ttlSeconds: number = CopilotCacheService.TTL_SECONDS): Promise<void> {
    try {
      await redis.set(cacheKey, JSON.stringify(value), ttlSeconds);
    } catch (err) {
      console.warn('[CopilotCacheService] Cache set error:', err);
    }
  }

  public async invalidateUserCache(userId: string): Promise<void> {
    try {
      await redis.del(`copilot:cache:${userId}:*`);
    } catch (err) {
      console.warn('[CopilotCacheService] Cache invalidation error:', err);
    }
  }
}

export const copilotCacheService = new CopilotCacheService();
