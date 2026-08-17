import { redis } from '@/lib/redis';
import { RESEARCH_CONFIG } from '../research.constants';

export class ResearchCacheService {
  private generateKey(userId: string, keySuffix: string): string {
    return `docai:research:user:${userId}:${keySuffix}`;
  }

  async get<T>(userId: string, keySuffix: string): Promise<T | null> {
    try {
      const key = this.generateKey(userId, keySuffix);
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(userId: string, keySuffix: string, value: T, ttlSeconds = RESEARCH_CONFIG.CACHE_TTL_SECONDS): Promise<void> {
    try {
      const key = this.generateKey(userId, keySuffix);
      await redis.set(key, JSON.stringify(value), ttlSeconds);
    } catch {}
  }

  async invalidate(userId: string, keySuffix: string): Promise<void> {
    try {
      const key = this.generateKey(userId, keySuffix);
      await redis.del(key);
    } catch {}
  }
}

export const researchCacheService = new ResearchCacheService();
