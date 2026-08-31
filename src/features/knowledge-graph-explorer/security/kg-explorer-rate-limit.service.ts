import { redis } from '@/lib/redis';
import { configService } from '@/features/config';

/**
 * Copies the Redis-INCR-with-in-memory-fallback shape of `checkRateLimit` in
 * `src/app/api/explore/answer/route.ts` verbatim, keyed per-user for the Explorer's own routes.
 *
 * Design choice: rate limiting is intentionally NOT threaded through `KgExplorerService` — there
 * is no shared `RateLimitError` class in this codebase, and the existing convention (see
 * `explore/answer/route.ts`) is for the ROUTE to check the limit directly and return a plain 429
 * itself. Keeping it in the route avoids inventing a new error type just to carry a status code
 * through the service layer.
 */
export class KgExplorerRateLimitService {
  private inMemoryMap = new Map<string, { count: number; resetAt: number }>();

  public async checkRateLimit(userId: string, keySuffix = ''): Promise<boolean> {
    const limit = await configService.getNumber('KG_EXPLORER_RATE_LIMIT_PER_MINUTE', 30);
    const windowMs = 60 * 1000;
    const now = Date.now();
    const key = `ratelimit:kg-explorer:${userId}${keySuffix}`;

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

export const kgExplorerRateLimitService = new KgExplorerRateLimitService();
