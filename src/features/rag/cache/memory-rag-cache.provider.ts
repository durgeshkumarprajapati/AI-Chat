import { env } from '@/config/env';
import { generateEmbeddingCacheKey, generateExactCacheKey, generateSemanticScopeKey, RAGCacheProvider } from './rag-cache.provider';
import { CacheKeyOptions, EmbeddingCacheItem, ExactCacheItem, SemanticCacheItem, SemanticCacheLookupResult } from './rag-cache.types';

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
  private semanticIndexes = new Map<string, string[]>();

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
    return (await this.getSemanticWithDiagnostics(keyOptions, queryVector, threshold)).item;
  }

  public async getSemanticWithDiagnostics(keyOptions: CacheKeyOptions, queryVector: number[], threshold?: number): Promise<SemanticCacheLookupResult> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return { item: null, similarity: null, candidateCount: 0 };
    const reqThreshold = threshold ?? env.server?.RAG_SEMANTIC_CACHE_THRESHOLD ?? 0.90;
    const now = Date.now();
    const candidateKeys = this.semanticIndexes.get(generateSemanticScopeKey(keyOptions)) || [];
    let best: SemanticCacheItem | null = null;
    let bestSimilarity = reqThreshold;
    let highestSimilarity: number | null = null;
    for (const key of candidateKeys) {
      const entry = this.semanticStore.get(key);
      if (!entry) continue;
      if (now > entry.expiresAt) {
        this.semanticStore.delete(key);
        continue;
      }
      const item = entry.value;
      if (!this.isCompatible(item, keyOptions)) {
        continue;
      }
      const sim = this.cosineSimilarity(queryVector, item.queryVector);
      highestSimilarity = highestSimilarity === null ? sim : Math.max(highestSimilarity, sim);
      if (sim >= bestSimilarity) {
        best = item;
        bestSimilarity = sim;
      }
    }
    return { item: best, similarity: highestSimilarity, candidateCount: candidateKeys.length, sourceFingerprint: best?.sourceFingerprint };
  }

  public async setSemantic(keyOptions: CacheKeyOptions, item: SemanticCacheItem, ttlSeconds?: number): Promise<void> {
    if (!isCacheEnabled() || !isSemanticCacheEnabled()) return;
    const ttl = (ttlSeconds || env.server?.RAG_SEMANTIC_CACHE_TTL_SECONDS || 3600) * 1000;
    const key = `rag:semantic:${keyOptions.userId}:${keyOptions.knowledgeBaseId || 'global'}:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = Date.now() + ttl;
    this.semanticStore.set(key, { value: { ...item, expiresAt: new Date(expiresAt).toISOString() }, expiresAt });
    const indexKey = generateSemanticScopeKey(keyOptions);
    const max = env.server?.RAG_SEMANTIC_CACHE_MAX_CANDIDATES ?? 20;
    this.semanticIndexes.set(indexKey, [key, ...(this.semanticIndexes.get(indexKey) || [])].slice(0, max));
  }

  public async invalidateUser(userId: string): Promise<void> {
    for (const key of this.exactStore.keys()) {
      if (key.includes(userId)) this.exactStore.delete(key);
    }
    for (const key of this.semanticStore.keys()) {
      if (key.includes(userId)) this.semanticStore.delete(key);
    }
    for (const key of this.semanticIndexes.keys()) if (key.includes(`:${userId}:`)) this.semanticIndexes.delete(key);
  }

  public async invalidateKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    for (const key of this.exactStore.keys()) {
      if (key.includes(knowledgeBaseId)) this.exactStore.delete(key);
    }
    for (const key of this.semanticStore.keys()) {
      if (key.includes(knowledgeBaseId)) this.semanticStore.delete(key);
    }
    for (const key of this.semanticIndexes.keys()) if (key.includes(`:${knowledgeBaseId}:`)) this.semanticIndexes.delete(key);
  }

  public async invalidateDocument(_documentId: string): Promise<void> {
    this.exactStore.clear();
    this.semanticStore.clear();
    this.semanticIndexes.clear();
  }

  private isCompatible(item: SemanticCacheItem, options: CacheKeyOptions): boolean {
    return item.userId === options.userId
      && item.knowledgeBaseId === (options.knowledgeBaseId || null)
      && item.model === (options.model || 'default')
      && item.answerMode === (options.answerMode || 'GROUNDED')
      && item.validEvidence && !item.invalidated && item.citations.length > 0;
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
