import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { LLMRequest, LLMResponse } from './llm.types';

export class LLMCacheService {
  private inMemoryCache: Map<string, { data: LLMResponse; expiresAt: number }> = new Map();
  private readonly defaultTTL = 1800; // 30 minutes

  /**
   * Compute stable SHA-256 request hash incorporating user/tenant scope to guarantee isolation.
   */
  public computeRequestHash(request: LLMRequest, providerName: string, modelName: string): string {
    const normPrompt = (request.prompt || '').trim().toLowerCase();
    const normContext = (request.context || '').trim().toLowerCase();
    const normSys = (request.systemPrompt || '').trim().toLowerCase();
    const scope = request.userId ? `user:${request.userId}` : 'public';

    const raw = `${scope}:${providerName}:${modelName}:${normPrompt}:${normContext}:${normSys}:${request.feature || 'general'}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  public getCacheKey(request: LLMRequest, providerName: string, modelName: string): string {
    const hash = this.computeRequestHash(request, providerName, modelName);
    const scopePrefix = request.userId ? `user:${request.userId}` : 'public';
    return `docai:llm:v1:${scopePrefix}:${hash}`;
  }

  public async getCachedResponse(
    request: LLMRequest,
    providerName: string,
    modelName: string
  ): Promise<LLMResponse | null> {
    if (request.skipCache || env.server?.LLM_GATEWAY_CACHE_ENABLED === false) {
      return null;
    }

    const key = this.getCacheKey(request, providerName, modelName);

    // 1. Try Redis cache
    try {
      const cached = await redis.getJson<LLMResponse>(key);
      if (cached) {
        return { ...cached, cached: true };
      }
    } catch (err) {
      console.warn('[LLMCacheService] Redis cache lookup warning:', err);
    }

    // 2. Try in-memory fallback
    const mem = this.inMemoryCache.get(key);
    if (mem && Date.now() < mem.expiresAt) {
      return { ...mem.data, cached: true };
    }

    return null;
  }

  public async setCachedResponse(
    request: LLMRequest,
    providerName: string,
    modelName: string,
    response: LLMResponse,
    ttlSeconds?: number
  ): Promise<void> {
    if (request.skipCache || env.server?.LLM_GATEWAY_CACHE_ENABLED === false) {
      return;
    }

    const key = this.getCacheKey(request, providerName, modelName);
    const ttl = ttlSeconds || this.defaultTTL;

    const payload: LLMResponse = {
      ...response,
      cached: true
    };

    this.inMemoryCache.set(key, {
      data: payload,
      expiresAt: Date.now() + ttl * 1000
    });

    try {
      await redis.setJson(key, payload, ttl);
    } catch (err) {
      console.warn('[LLMCacheService] Redis cache set warning:', err);
    }
  }

  public async clearUserCache(userId: string): Promise<void> {
    const prefix = `docai:llm:v1:user:${userId}:`;
    for (const k of Array.from(this.inMemoryCache.keys())) {
      if (k.startsWith(prefix)) {
        this.inMemoryCache.delete(k);
      }
    }
  }

  public clearCache(): void {
    this.inMemoryCache.clear();
  }
}

export const llmCacheService = new LLMCacheService();
