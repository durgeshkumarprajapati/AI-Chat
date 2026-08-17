import { redis } from '@/lib/redis';
import { STUDY_CONFIG } from '../study.constants';

export class StudyCacheService {
  private generateKey(userId: string, keySuffix: string): string {
    return `docai:study:user:${userId}:${keySuffix}`;
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

  async set<T>(userId: string, keySuffix: string, value: T, ttlSeconds = STUDY_CONFIG.CACHE_TTL_SECONDS): Promise<void> {
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

export const studyCacheService = new StudyCacheService();
