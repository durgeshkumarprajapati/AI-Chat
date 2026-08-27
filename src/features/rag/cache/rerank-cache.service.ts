import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import crypto from 'crypto';

export interface RerankCacheOptions {
  tenantId: string;
  queryHash: string;
  candidateSetHash: string;
  rerankerVersion?: string;
}

export class RerankCacheService {
  public generateKey(opts: RerankCacheOptions): string {
    const version = opts.rerankerVersion || 'v1';
    return `rag:v3:rerank:tenant:${opts.tenantId}:query:${opts.queryHash}:candidates:${opts.candidateSetHash}:version:${version}`;
  }

  public async getRerankedChunks(opts: RerankCacheOptions): Promise<RetrievedChunk[] | null> {
    if (!env.server?.RAG_RERANK_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED) {
      return null;
    }
    try {
      const key = this.generateKey(opts);
      const cached = await redis.getJson<RetrievedChunk[]>(key);
      return cached || null;
    } catch (err) {
      console.warn('[RerankCache] Redis read failed (bypassing rerank cache):', err);
      return null;
    }
  }

  public async setRerankedChunks(opts: RerankCacheOptions, chunks: RetrievedChunk[]): Promise<void> {
    if (!env.server?.RAG_RERANK_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED || chunks.length === 0) {
      return;
    }
    try {
      const key = this.generateKey(opts);
      const ttl = env.server?.RAG_RERANK_CACHE_TTL_SECONDS ?? 300;
      await redis.setJson(key, chunks, ttl);
    } catch (err) {
      console.warn('[RerankCache] Redis write failed:', err);
    }
  }

  public generateCandidateSetHash(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return 'empty';
    const ids = chunks.map((c) => `${c.documentId}:${c.chunkIndex}`).sort().join('|');
    return crypto.createHash('sha256').update(ids).digest('hex').substring(0, 16);
  }
}

export const rerankCacheService = new RerankCacheService();
