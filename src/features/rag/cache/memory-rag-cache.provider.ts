import { env } from '@/config/env';
import { generateEmbeddingCacheKey, generateExactCacheKey, RAGCacheProvider } from './rag-cache.provider';
import { CacheKeyOptions, EmbeddingCacheItem, ExactCacheItem, SemanticCacheItem } from './rag-cache.types';

type MemoryStoreEntry<T> = {
  value: T;
  expiresAt: number;
};

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

export class MemoryRAGCacheProvider implements RAGCacheProvider {
  private exactStore = new Map<string, MemoryStoreEntry<ExactCacheItem>>();
  private embedStore = new Map<string, MemoryStoreEntry<EmbeddingCacheItem>>();
  private semanticStore = new Map<string, MemoryStoreEntry<SemanticCacheItem>>();

  public async getExact(keyOptions: CacheKeyOptions): Promise<ExactCacheItem | null> {
    if (!isCacheEnabled() || !isExactCacheEnabled()) return null;
    const key = generateExactCacheKey(keyOptions);
    const entry = this.exactStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.exactStore.delete(key);
      return null;
    }
    return entry.value;
  }

  public async setExact(keyOptions: CacheKeyOptions, item: ExactCacheItem, ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isExactCacheEnabled()) return;
    const key = generateExactCacheKey(keyOptions);
    const ttl = (ttlSeconds || env.server?.RAG_CACHE_TTL_SECONDS || 300) * 1000;
    this.exactStore.set(key, { value: item, expiresAt: Date.now() + ttl });
  }

  public async getEmbedding(provider: string, model: string, text: string): Promise<number[] | null> {
    if (!isCacheEnabled() || !isEmbeddingCacheEnabled()) return null;
    const key = generateEmbeddingCacheKey(provider, model, text);
    const entry = this.embedStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.embedStore.delete(key);
      return null;
    }
    return entry.value.vector;
  }

  public async setEmbedding(provider: string, model: string, text: string, vector: number[], ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isEmbeddingCacheEnabled()) return;
    const key = generateEmbeddingCacheKey(provider, model, text);
    const ttl = (ttlSeconds || 86400 * 7) * 1000;
    this.embedStore.set(key, {
      value: { vector, provider, model, cachedAt: new Date().toISOString() },
      expiresAt: Date.now() + ttl
    });
  }

  public async getSemantic(keyOptions: CacheKeyOptions, queryVector: number[], threshold?: number): Promise<SemanticCacheItem | null> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return null;
    const reqThreshold = threshold || env.server?.RAG_SEMANTIC_CACHE_THRESHOLD || 0.94;
    const now = Date.now();

    for (const [key, entry] of this.semanticStore.entries()) {
      if (now > entry.expiresAt) {
        this.semanticStore.delete(key);
        continue;
      }
      const item = entry.value;
      if (item.userId !== keyOptions.userId || item.knowledgeBaseId !== (keyOptions.knowledgeBaseId || null)) {
        continue;
      }
      const sim = this.cosineSimilarity(queryVector, item.queryVector);
      if (sim >= reqThreshold) {
        return item;
      }
    }
    return null;
  }

  public async setSemantic(keyOptions: CacheKeyOptions, item: SemanticCacheItem, ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return;
    const ttl = (ttlSeconds || env.server?.RAG_CACHE_TTL_SECONDS || 300) * 1000;
    const key = `rag:semantic:${keyOptions.userId}:${keyOptions.knowledgeBaseId || 'global'}:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.semanticStore.set(key, { value: item, expiresAt: Date.now() + ttl });
  }

  public async invalidateUser(userId: string): Promise<void> {
    for (const key of this.exactStore.keys()) {
      if (key.includes(userId)) this.exactStore.delete(key);
    }
    for (const key of this.semanticStore.keys()) {
      if (key.includes(userId)) this.semanticStore.delete(key);
    }
  }

  public async invalidateKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    for (const key of this.exactStore.keys()) {
      if (key.includes(knowledgeBaseId)) this.exactStore.delete(key);
    }
    for (const key of this.semanticStore.keys()) {
      if (key.includes(knowledgeBaseId)) this.semanticStore.delete(key);
    }
  }

  public async invalidateDocument(_documentId: string): Promise<void> {
    this.exactStore.clear();
    this.semanticStore.clear();
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
