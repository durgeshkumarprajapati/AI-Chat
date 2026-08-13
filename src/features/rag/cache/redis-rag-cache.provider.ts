import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { generateEmbeddingCacheKey, generateExactCacheKey, RAGCacheProvider } from './rag-cache.provider';
import { CacheKeyOptions, EmbeddingCacheItem, ExactCacheItem, SemanticCacheItem } from './rag-cache.types';

function isCacheEnabled(): boolean {
  return env.server ? env.server.RAG_CACHE_ENABLED : process.env.RAG_CACHE_ENABLED !== 'false';
}

function isExactCacheEnabled(): boolean {
  return env.server ? env.server.RAG_EXACT_CACHE_ENABLED : process.env.RAG_EXACT_CACHE_ENABLED !== 'false';
}

function isEmbeddingCacheEnabled(): boolean {
  return env.server ? env.server.RAG_EMBEDDING_CACHE_ENABLED : process.env.RAG_EMBEDDING_CACHE_ENABLED !== 'false';
}

function isSemanticCacheEnabled(): boolean {
  return env.server ? env.server.RAG_SEMANTIC_CACHE_ENABLED : process.env.RAG_SEMANTIC_CACHE_ENABLED === 'true';
}

export class RedisRAGCacheProvider implements RAGCacheProvider {
  public async getExact(keyOptions: CacheKeyOptions): Promise<ExactCacheItem | null> {
    if (!isCacheEnabled() || !isExactCacheEnabled()) return null;
    try {
      const key = generateExactCacheKey(keyOptions);
      return await redis.getJson<ExactCacheItem>(key);
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Exact cache lookup failed safely:', err);
      return null;
    }
  }

  public async setExact(keyOptions: CacheKeyOptions, item: ExactCacheItem, ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isExactCacheEnabled()) return;
    try {
      const key = generateExactCacheKey(keyOptions);
      const ttl = ttlSeconds || env.server?.RAG_CACHE_TTL_SECONDS || 300;
      await redis.setJson(key, item, ttl);
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Exact cache store failed safely:', err);
    }
  }

  public async getEmbedding(provider: string, model: string, text: string): Promise<number[] | null> {
    if (!isCacheEnabled() || !isEmbeddingCacheEnabled()) return null;
    try {
      const key = generateEmbeddingCacheKey(provider, model, text);
      const item = await redis.getJson<EmbeddingCacheItem>(key);
      return item ? item.vector : null;
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Embedding cache lookup failed safely:', err);
      return null;
    }
  }

  public async setEmbedding(provider: string, model: string, text: string, vector: number[], ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isEmbeddingCacheEnabled()) return;
    try {
      const key = generateEmbeddingCacheKey(provider, model, text);
      const ttl = ttlSeconds || 86400 * 7;
      const item: EmbeddingCacheItem = { vector, provider, model, cachedAt: new Date().toISOString() };
      await redis.setJson(key, item, ttl);
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Embedding cache store failed safely:', err);
    }
  }

  public async getSemantic(keyOptions: CacheKeyOptions, queryVector: number[], threshold?: number): Promise<SemanticCacheItem | null> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return null;
    try {
      const client = await redis.getClient();
      const pattern = `rag:semantic:${keyOptions.userId}:${keyOptions.knowledgeBaseId || 'global'}:*`;
      const keys = await client.keys(pattern);
      const reqThreshold = threshold || env.server?.RAG_SEMANTIC_CACHE_THRESHOLD || 0.94;

      for (const key of keys) {
        const item = await redis.getJson<SemanticCacheItem>(key);
        if (!item || !item.queryVector) continue;
        const sim = this.cosineSimilarity(queryVector, item.queryVector);
        if (sim >= reqThreshold) {
          return item;
        }
      }
      return null;
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Semantic cache lookup failed safely:', err);
      return null;
    }
  }

  public async setSemantic(keyOptions: CacheKeyOptions, item: SemanticCacheItem, ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return;
    try {
      const ttl = ttlSeconds || env.server?.RAG_CACHE_TTL_SECONDS || 300;
      const key = `rag:semantic:${keyOptions.userId}:${keyOptions.knowledgeBaseId || 'global'}:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await redis.setJson(key, item, ttl);
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Semantic cache store failed safely:', err);
    }
  }

  public async invalidateUser(userId: string): Promise<void> {
    try {
      const client = await redis.getClient();
      const keys = await client.keys(`rag:*${userId}*`);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Invalidate user failed safely:', err);
    }
  }

  public async invalidateKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    try {
      const client = await redis.getClient();
      const keys = await client.keys(`rag:*${knowledgeBaseId}*`);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Invalidate KB failed safely:', err);
    }
  }

  public async invalidateDocument(_documentId: string): Promise<void> {
    try {
      const client = await redis.getClient();
      const keys = await client.keys(`rag:exact:*`);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (err) {
      console.warn('[RedisRAGCacheProvider] Invalidate doc failed safely:', err);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const valA = a[i]!;
      const valB = b[i]!;
      dot += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
