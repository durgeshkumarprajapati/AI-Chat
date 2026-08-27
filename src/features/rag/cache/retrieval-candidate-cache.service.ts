import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import crypto from 'crypto';

export interface RetrievalCandidateCacheOptions {
  tenantId: string;
  scopeType: 'PRIVATE' | 'GROUP' | 'PROJECT';
  scopeId: string; // userId, conversationId, or projectId
  sourceVersionHash: string;
  queryHash: string;
  strategyHash?: string;
}

export class RetrievalCandidateCacheService {
  public generateKey(opts: RetrievalCandidateCacheOptions): string {
    const strategy = opts.strategyHash || 'default';
    return `rag:v3:retrieval:tenant:${opts.tenantId}:scope:${opts.scopeType}:scopeId:${opts.scopeId}:sources:${opts.sourceVersionHash}:query:${opts.queryHash}:strategy:${strategy}`;
  }

  public async getCandidates(opts: RetrievalCandidateCacheOptions): Promise<RetrievedChunk[] | null> {
    if (!env.server?.RAG_RETRIEVAL_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED) {
      return null;
    }
    try {
      const key = this.generateKey(opts);
      const cached = await redis.getJson<RetrievedChunk[]>(key);
      return cached || null;
    } catch (err) {
      console.warn('[RetrievalCandidateCache] Redis read failed (bypassing candidate cache):', err);
      return null;
    }
  }

  public async setCandidates(opts: RetrievalCandidateCacheOptions, chunks: RetrievedChunk[]): Promise<void> {
    if (!env.server?.RAG_RETRIEVAL_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED || chunks.length === 0) {
      return;
    }
    try {
      const key = this.generateKey(opts);
      const ttl = env.server?.RAG_RETRIEVAL_CACHE_TTL_SECONDS ?? 300;
      await redis.setJson(key, chunks, ttl);
    } catch (err) {
      console.warn('[RetrievalCandidateCache] Redis write failed:', err);
    }
  }

  public generateSourceVersionHash(sourceIds: string[]): string {
    if (sourceIds.length === 0) return 'empty';
    const sorted = [...sourceIds].sort().join('|');
    return crypto.createHash('sha256').update(sorted).digest('hex').substring(0, 16);
  }
}

export const retrievalCandidateCacheService = new RetrievalCandidateCacheService();
