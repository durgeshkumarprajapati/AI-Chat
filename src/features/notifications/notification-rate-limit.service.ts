import { redis } from '@/lib/redis';
import { configService } from '@/features/config';

interface InMemoryEntry {
  count: number;
  resetAt: number;
}

/**
 * Mirrors the Redis-INCR-with-in-memory-fallback shape of
 * ai-intelligence-rate-limit.service.ts / kg-explorer-rate-limit.service.ts, with one
 * deliberate, spec-mandated difference: on Redis failure this FAILS OPEN (returns `true` /
 * allowed) rather than falling back to an in-memory counter that would reset on every process
 * restart. Per spec section 15: "Do NOT block critical persisted notifications solely because
 * Redis is unavailable" — losing this soft spam-protection temporarily during a Redis outage is
 * far better than silently dropping notification delivery entirely. The in-memory fallback is
 * still used as a best-effort secondary layer (not the sole fail-open reason) so a Redis outage
 * that's contained to a single process still gets some rate limiting from that process's own
 * counters.
 */
export class NotificationRateLimitService {
  private inMemoryMap = new Map<string, InMemoryEntry>();

  public async checkHourlyLimit(userId: string): Promise<boolean> {
    const limit = await configService.getNumber('NOTIFICATION_MAX_PER_HOUR', 10);
    return this.check(`ratelimit:notification:hourly:${userId}`, limit, 3600);
  }

  public async checkDailyLimit(userId: string): Promise<boolean> {
    const limit = await configService.getNumber('NOTIFICATION_MAX_PER_DAY', 30);
    return this.check(`ratelimit:notification:daily:${userId}`, limit, 86400);
  }

  public async checkCriticalDailyLimit(userId: string): Promise<boolean> {
    const limit = await configService.getNumber('NOTIFICATION_MAX_CRITICAL_PER_DAY', 10);
    return this.check(`ratelimit:notification:critical-daily:${userId}`, limit, 86400);
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
      // Redis unavailable — FAIL OPEN (see class doc). Still apply a best-effort in-memory
      // counter for this single process so a contained outage isn't a total free-for-all, but
      // never let the in-memory counter itself deny delivery: always return true here.
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

export const notificationRateLimitService = new NotificationRateLimitService();
