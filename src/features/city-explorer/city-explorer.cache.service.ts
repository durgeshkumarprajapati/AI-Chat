import { createHash, randomBytes } from 'crypto';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { CityExplorerAnswerResult, QuestionKind } from './city-explorer.types';
import { PROMPT_VERSION } from './city-explorer.questions';

export class CityExplorerCacheService {
  private inMemoryCache: Map<string, { data: CityExplorerAnswerResult; expiresAt: number }> = new Map();

  /**
   * Compute stable SHA-256 cache fingerprint for a city + question pair.
   */
  public computeFingerprint(city: string, questionId: string, sourceMode: string = 'web_search'): string {
    const normCity = city.toLowerCase().trim();
    const normQ = questionId.toLowerCase().trim();
    const raw = `${normCity}:${normQ}:${sourceMode}:${PROMPT_VERSION}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Determine TTL based on question kind (STATIC vs DYNAMIC).
   */
  public getTTLSeconds(kind: QuestionKind): number {
    if (kind === 'STATIC') {
      return env.server?.CITY_EXPLORER_STATIC_TTL_SECONDS ?? 86400;
    }
    return env.server?.CITY_EXPLORER_DYNAMIC_TTL_SECONDS ?? 1800;
  }

  /**
   * Get cached answer result by city & question ID.
   */
  public async getCachedAnswer(
    city: string,
    questionId: string,
    sourceMode: string = 'web_search'
  ): Promise<{ result: CityExplorerAnswerResult; isStale: boolean } | null> {
    const fingerprint = this.computeFingerprint(city, questionId, sourceMode);
    const key = `city-explorer:${city.toLowerCase().trim()}:question:${fingerprint}`;

    // 1. Try Redis cache first
    try {
      const parsed = await redis.getJson<CityExplorerAnswerResult>(key);
      if (parsed) {
        return { result: { ...parsed, cached: true }, isStale: false };
      }
    } catch (err) {
      console.warn('[CityExplorerCacheService] Redis get failed, checking in-memory cache fallback:', err);
    }

    // 2. Try in-memory fallback
    const mem = this.inMemoryCache.get(key);
    if (mem) {
      const isStale = Date.now() > mem.expiresAt;
      return { result: { ...mem.data, cached: true }, isStale };
    }

    return null;
  }

  /**
   * Store answer result in cache with appropriate TTL.
   */
  public async setCachedAnswer(
    city: string,
    questionId: string,
    result: CityExplorerAnswerResult,
    kind: QuestionKind = 'STATIC',
    sourceMode: string = 'web_search'
  ): Promise<void> {
    const fingerprint = this.computeFingerprint(city, questionId, sourceMode);
    const key = `city-explorer:${city.toLowerCase().trim()}:question:${fingerprint}`;
    const ttlSeconds = this.getTTLSeconds(kind);

    const payload: CityExplorerAnswerResult = {
      ...result,
      cached: true,
      generatedAt: result.generatedAt || new Date().toISOString()
    };

    // Store in in-memory fallback
    this.inMemoryCache.set(key, {
      data: payload,
      expiresAt: Date.now() + ttlSeconds * 1000
    });

    // Store in Redis
    try {
      await redis.setJson(key, payload, ttlSeconds);
    } catch (err) {
      console.warn('[CityExplorerCacheService] Redis set failed:', err);
    }
  }

  /**
   * Acquire a generation lock for a specific question fingerprint to avoid duplicate concurrent LLM/Web calls.
   */
  public async acquireGenerationLock(fingerprint: string, ttlSeconds: number = 10): Promise<string | null> {
    const lockKey = `city-explorer:lock:${fingerprint}`;
    const ownerToken = randomBytes(16).toString('hex');

    try {
      const acquired = await redis.acquireLock(lockKey, ttlSeconds);
      if (acquired) return ownerToken;
    } catch {
      // In-memory lock fallback
      const memLockKey = `lock:${lockKey}`;
      if (!this.inMemoryCache.has(memLockKey)) {
        this.inMemoryCache.set(memLockKey, { data: {} as any, expiresAt: Date.now() + ttlSeconds * 1000 });
        return ownerToken;
      }
    }

    return null;
  }

  /**
   * Release generation lock only if token matches.
   */
  public async releaseGenerationLock(fingerprint: string, _ownerToken: string): Promise<void> {
    const lockKey = `city-explorer:lock:${fingerprint}`;
    try {
      await redis.releaseLock(lockKey);
    } catch {
      this.inMemoryCache.delete(`lock:${lockKey}`);
    }
  }

  /**
   * Clear cache for a specific city.
   */
  public async invalidateCityCache(city: string): Promise<void> {
    const prefix = `city-explorer:${city.toLowerCase().trim()}:question:`;
    try {
      const client = await redis.getClient();
      const keys = await client.keys(`${prefix}*`);
      for (const k of keys) {
        await redis.del(k);
      }
    } catch (err) {
      console.warn('[CityExplorerCacheService] Redis invalidate city cache warning:', err);
    }

    for (const k of Array.from(this.inMemoryCache.keys())) {
      if (k.startsWith(prefix)) {
        this.inMemoryCache.delete(k);
      }
    }
  }
}

export const cityExplorerCacheService = new CityExplorerCacheService();
