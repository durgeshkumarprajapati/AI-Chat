import { NextRequest } from 'next/server';

interface RateLimitStore {
  count: number;
  resetAt: number;
}

class MemoryRateLimiter {
  private store = new Map<string, RateLimitStore>();

  /**
   * Checks rate limit for a key (IP or identifier).
   * Default: 10 requests per 60,000ms (1 minute).
   */
  public check(key: string, limit = 10, windowMs = 60000): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || record.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetMs: windowMs };
    }

    if (record.count >= limit) {
      return { allowed: false, remaining: 0, resetMs: record.resetAt - now };
    }

    record.count += 1;
    return { allowed: true, remaining: limit - record.count, resetMs: record.resetAt - now };
  }

  /**
   * Helper to extract client IP address from NextRequest.
   */
  public getClientIp(req: NextRequest): string {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1'
    );
  }
}

export const rateLimiter = new MemoryRateLimiter();
