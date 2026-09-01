import { redis } from '@/lib/redis';
import { configService } from '@/features/config/config.service';

interface InMemoryEntry {
  count: number;
  resetAt: number;
}

/**
 * Phase 89 — mirrors automation-rate-limit.service.ts's (Phase 88) Redis-INCR-with-in-memory-
 * fallback shape exactly, the most-recent canonical pattern for this codebase: on Redis failure
 * this FAILS OPEN (never blocks a legitimate chat turn just because Redis is down).
 * AI_ASSISTANT_RATE_LIMIT_PER_HOUR caps a single user's total Assistant chat turns per rolling
 * hour, across all of that user's conversations.
 */
export class AssistantRateLimitService {
  private inMemoryMap = new Map<string, InMemoryEntry>();

  public async checkUserHourlyLimit(userId: string): Promise<boolean> {
    const limit = await configService.getNumber('AI_ASSISTANT_RATE_LIMIT_PER_HOUR', 60);
    return this.check(`ratelimit:assistant-user:hourly:${userId}`, limit, 3600);
  }

  private async check(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
    const windowMs = ttlSeconds * 1000;
    const now = Date.now();

    try {
      const client = await redis.getClient();
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, ttlSeconds);
      }
      return current <= limit;
    } catch {
      // Redis unavailable — FAIL OPEN (see class doc). Best-effort in-memory counter for this
      // single process only; never lets the in-memory counter itself deny a chat turn.
      let entry = this.inMemoryMap.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + windowMs };
      } else {
        entry.count++;
      }
      this.inMemoryMap.set(key, entry);
      return true;
    }
  }
}

export const assistantRateLimitService = new AssistantRateLimitService();
