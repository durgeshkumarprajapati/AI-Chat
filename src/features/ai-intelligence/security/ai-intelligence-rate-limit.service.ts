import { redis } from '@/lib/redis';
import { configService } from '@/features/config/config.service';

/**
 * Copies the Redis-INCR-with-in-memory-fallback shape of kg-explorer-rate-limit.service.ts
 * (itself mirroring `checkRateLimit` in src/app/api/explore/answer/route.ts) verbatim, keyed
 * per-user for the AI Workspace Intelligence on-demand manual-trigger POST routes
 * (/api/intelligence/daily, /api/intelligence/weekly).
 */
export class AiIntelligenceRateLimitService {
  private inMemoryMap = new Map<string, { count: number; resetAt: number }>();

  public async checkRateLimit(userId: string, keySuffix = ''): Promise<boolean> {
    const limit = await configService.getNumber('AI_INTELLIGENCE_MANUAL_TRIGGER_RATE_LIMIT_PER_MINUTE', 5);
    const windowMs = 60 * 1000;
    const now = Date.now();
    const key = `ratelimit:ai-intelligence:${userId}${keySuffix}`;

    try {
      const client = await redis.getClient();
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, 60);
      }
      return current <= limit;
    } catch {
      let entry = this.inMemoryMap.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + windowMs };
        this.inMemoryMap.set(key, entry);
        return true;
      }
      entry.count++;
      return entry.count <= limit;
    }
  }
}

export const aiIntelligenceRateLimitService = new AiIntelligenceRateLimitService();
