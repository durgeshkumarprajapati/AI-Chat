import { createHash, randomBytes } from 'crypto';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { CityExplorerAnswerResult, QuestionKind } from './city-explorer.types';
import { PROMPT_VERSION } from './city-explorer.questions';

export class CityExplorerCacheService {
  private inMemoryCache: Map<string, { data: CityExplorerAnswerResult; expiresAt: number }> = new Map();

  /**
   * Compute stable SHA-256 fingerprint for a city + question pair.
   */
  public computeFingerprint(city: string, questionId: string, sourceMode: string = 'WEB_PUBLIC'): string {
    const normCity = city.toLowerCase().trim();
    const normQ = questionId.toLowerCase().trim();
    const cacheVer = env.server?.CITY_EXPLORER_CACHE_VERSION || 'v3';
    const promptVer = env.server?.CITY_EXPLORER_PROMPT_VERSION || PROMPT_VERSION;
    const raw = `${normCity}:${normQ}:${sourceMode}:${cacheVer}:${promptVer}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Constructs shared public Redis cache key format docai:city:public:v3:<city>:<questionId>:<hash>
   */
  public getPublicCacheKey(city: string, questionId: string, fingerprint: string): string {
    const normCity = city.toLowerCase().trim();
    const normQ = questionId.toLowerCase().trim();
    const cacheVer = env.server?.CITY_EXPLORER_CACHE_VERSION || 'v3';
    return `docai:city:public:${cacheVer}:${normCity}:${normQ}:${fingerprint}`;
  }

  /**
   * Determine TTL based on question kind (STATIC vs DYNAMIC).
   */
  public getTTLSeconds(kind: QuestionKind): number {
    if (kind === 'STATIC') {
      return env.server?.CITY_EXPLORER_STATIC_TTL_SECONDS ?? 86400;
    }
    return env.server?.CITY_EXPLORER_DYNAMIC_TTL_SECONDS ?? 600;
  }

  /**
   * Get cached public answer result by city & question ID.
   */
  public async getCachedAnswer(
    city: string,
    questionId: string,
    sourceMode: string = 'WEB_PUBLIC'
  ): Promise<{ result: CityExplorerAnswerResult; isStale: boolean } | null> {
    const fingerprint = this.computeFingerprint(city, questionId, sourceMode);
    const key = this.getPublicCacheKey(city, questionId, fingerprint);

    // 1. Try shared public Redis cache first
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
   * Store public city answer result in shared cache with appropriate TTL.
   */
  public async setCachedAnswer(
    city: string,
    questionId: string,
    result: CityExplorerAnswerResult,
    kind: QuestionKind = 'STATIC',
    sourceMode: string = 'WEB_PUBLIC'
  ): Promise<void> {
    const fingerprint = this.computeFingerprint(city, questionId, sourceMode);
    const key = this.getPublicCacheKey(city, questionId, fingerprint);
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

    // Store in shared Redis public cache
    try {
      await redis.setJson(key, payload, ttlSeconds);
    } catch (err) {
      console.warn('[CityExplorerCacheService] Redis set failed:', err);
    }
  }

  /**
   * Acquire a generation lock for a specific question fingerprint to avoid duplicate concurrent LLM calls.
   */
  public async acquireGenerationLock(_fingerprint: string, _ttlSeconds?: number): Promise<string | null>;
  public async acquireGenerationLock(_city: string, _questionId: string, _ttlSeconds?: number): Promise<string | null>;
  public async acquireGenerationLock(cityOrFingerprint: string, questionIdOrTtl?: string | number, ttlSecondsParam: number = 10): Promise<string | null> {
    let lockKey = `city-explorer:lock:${cityOrFingerprint}`;
    let ttlSeconds = ttlSecondsParam;

    if (typeof questionIdOrTtl === 'string') {
      const normCity = cityOrFingerprint.toLowerCase().trim();
      lockKey = `docai:lock:city:${normCity}:${questionIdOrTtl.toLowerCase().trim()}`;
    } else if (typeof questionIdOrTtl === 'number') {
      ttlSeconds = questionIdOrTtl;
    }

    const ownerToken = randomBytes(16).toString('hex');

    try {
      const acquired = await redis.acquireLock(lockKey, ttlSeconds);
      if (acquired) return ownerToken;
    } catch {
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
  public async releaseGenerationLock(_fingerprint: string, _ownerToken?: string): Promise<void>;
  public async releaseGenerationLock(_city: string, _questionId: string, _ownerToken?: string): Promise<void>;
  public async releaseGenerationLock(cityOrFingerprint: string, questionIdOrOwner?: string, _ownerToken?: string): Promise<void> {
    let lockKey = `city-explorer:lock:${cityOrFingerprint}`;
    if (_ownerToken !== undefined && typeof questionIdOrOwner === 'string') {
      const normCity = cityOrFingerprint.toLowerCase().trim();
      lockKey = `docai:lock:city:${normCity}:${questionIdOrOwner.toLowerCase().trim()}`;
    }
    try {
      await redis.releaseLock(lockKey);
    } catch {
      this.inMemoryCache.delete(`lock:${lockKey}`);
    }
  }

  /**
   * Clear shared cache for a specific city.
   */
  public async invalidateCityCache(city: string): Promise<void> {
    const normCity = city.toLowerCase().trim();
    const cacheVer = env.server?.CITY_EXPLORER_CACHE_VERSION || 'v3';
    const prefix = `docai:city:public:${cacheVer}:${normCity}:`;

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
