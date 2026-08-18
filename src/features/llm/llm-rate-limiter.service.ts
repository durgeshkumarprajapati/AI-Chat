import { redis } from '@/lib/redis';
import { env } from '@/config/env';

export class LLMRateLimiterService {
  private inMemoryCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly defaultLimitPerMinute = env.server?.GEMINI_RATE_LIMIT_PER_MINUTE || 120;

  public async checkRateLimit(
    providerName: string,
    userId?: string
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const pName = providerName.toLowerCase();
    const limit = pName === 'gemini' ? (env.server?.GEMINI_RATE_LIMIT_PER_MINUTE || 120) : this.defaultLimitPerMinute;

    const windowKey = Math.floor(Date.now() / 60000);
    const key = `docai:llm:ratelimit:${pName}:${userId ? `user:${userId}` : 'global'}:${windowKey}`;

    try {
      const client = await redis.getClient();
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, 60);
      }

      if (current > limit) {
        return { allowed: false, remaining: 0, resetMs: (60 - (Math.floor(Date.now() / 1000) % 60)) * 1000 };
      }

      return { allowed: true, remaining: limit - current, resetMs: (60 - (Math.floor(Date.now() / 1000) % 60)) * 1000 };
    } catch {
      // Redis fallback to in-memory windowing
      const memKey = `${key}`;
      const now = Date.now();
      let record = this.inMemoryCounts.get(memKey);

      if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + 60000 };
        this.inMemoryCounts.set(memKey, record);
        return { allowed: true, remaining: limit - 1, resetMs: 60000 };
      }

      record.count++;
      if (record.count > limit) {
        return { allowed: false, remaining: 0, resetMs: record.resetTime - now };
      }

      return { allowed: true, remaining: limit - record.count, resetMs: record.resetTime - now };
    }
  }
}

export const llmRateLimiterService = new LLMRateLimiterService();
