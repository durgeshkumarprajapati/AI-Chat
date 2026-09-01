import { redis } from '@/lib/redis';

interface InMemoryEntry {
  count: number;
  resetAt: number;
}

const EXPORT_LIMIT_PER_HOUR = 10;
const WINDOW_SECONDS = 3600;

/**
 * Phase 90 — lightweight rate limit for GET /api/copilot/memory/export, a heavier read than a
 * normal memory list fetch. Mirrors `automation-rate-limit.service.ts`'s exact Redis-INCR-with-
 * fail-open-fallback shape: on Redis failure this FAILS OPEN (never blocks a legitimate export
 * just because Redis is down).
 */
export class MemoryExportRateLimitService {
  private inMemoryMap = new Map<string, InMemoryEntry>();

  public async checkUserHourlyLimit(userId: string): Promise<boolean> {
    return this.check(`ratelimit:memory-export:hourly:${userId}`, EXPORT_LIMIT_PER_HOUR, WINDOW_SECONDS);
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

export const memoryExportRateLimitService = new MemoryExportRateLimitService();
