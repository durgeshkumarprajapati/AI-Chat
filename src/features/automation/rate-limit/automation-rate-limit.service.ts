import { redis } from '@/lib/redis';
import { configService } from '@/features/config/config.service';

interface InMemoryEntry {
  count: number;
  resetAt: number;
}

/**
 * Phase 88 — mirrors notification-rate-limit.service.ts's Redis-INCR-with-in-memory-fallback
 * shape exactly, with the same deliberate choice: on Redis failure this FAILS OPEN (never blocks
 * a legitimate execution just because Redis is down). WORKFLOW_MAX_EXECUTIONS_PER_HOUR caps a
 * single automation's own execution rate; WORKFLOW_RATE_LIMIT_PER_HOUR caps a user's total
 * automation-execution rate across all of their automations.
 */
export class AutomationRateLimitService {
  private inMemoryMap = new Map<string, InMemoryEntry>();

  public async checkAutomationHourlyLimit(automationId: string): Promise<boolean> {
    const limit = await configService.getNumber('WORKFLOW_MAX_EXECUTIONS_PER_HOUR', 20);
    return this.check(`ratelimit:automation:hourly:${automationId}`, limit, 3600);
  }

  public async checkUserHourlyLimit(userId: string): Promise<boolean> {
    const limit = await configService.getNumber('WORKFLOW_RATE_LIMIT_PER_HOUR', 20);
    return this.check(`ratelimit:automation-user:hourly:${userId}`, limit, 3600);
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
      // single process only; never lets the in-memory counter itself deny an execution.
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

export const automationRateLimitService = new AutomationRateLimitService();
