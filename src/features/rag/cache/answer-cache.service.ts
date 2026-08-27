import { redis } from '@/lib/redis';
import { env } from '@/config/env';
import { OrchestratedAnswer } from '../orchestration/answer-orchestrator.types';
import crypto from 'crypto';

export interface AnswerCacheOptions {
  tenantId: string;
  scopeType: 'PRIVATE' | 'GROUP' | 'PROJECT';
  scopeId: string;
  conversationId: string;
  sourceVersionHash: string;
  queryHash: string;
  contextHash?: string;
}

export class AnswerCacheService {
  public generateKey(opts: AnswerCacheOptions): string {
    const ctx = opts.contextHash || 'none';
    return `rag:v3:answer:tenant:${opts.tenantId}:scope:${opts.scopeType}:scopeId:${opts.scopeId}:conversation:${opts.conversationId}:sources:${opts.sourceVersionHash}:query:${opts.queryHash}:context:${ctx}`;
  }

  public async getAnswer(opts: AnswerCacheOptions): Promise<OrchestratedAnswer | null> {
    if (!env.server?.RAG_ANSWER_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED) {
      return null;
    }
    try {
      const key = this.generateKey(opts);
      const cached = await redis.getJson<OrchestratedAnswer>(key);
      if (cached) {
        return {
          ...cached,
          cacheHit: true,
          cacheType: 'exact'
        };
      }
      return null;
    } catch (err) {
      console.warn('[AnswerCache] Redis read failed (bypassing answer cache):', err);
      return null;
    }
  }

  public async setAnswer(opts: AnswerCacheOptions, answer: OrchestratedAnswer): Promise<void> {
    if (!env.server?.RAG_ANSWER_CACHE_ENABLED || !env.server?.RAG_PERFORMANCE_OPTIMIZATION_ENABLED) {
      return;
    }
    if (!answer.answer.trim() || answer.answerMode === 'NO_DOCUMENT_EVIDENCE') {
      return;
    }
    try {
      const key = this.generateKey(opts);
      const ttl = env.server?.RAG_ANSWER_CACHE_TTL_SECONDS ?? 180;
      await redis.setJson(key, answer, ttl);
    } catch (err) {
      console.warn('[AnswerCache] Redis write failed:', err);
    }
  }

  public generateContextHash(contextSummary?: string | null): string {
    if (!contextSummary || !contextSummary.trim()) return 'none';
    return crypto.createHash('sha256').update(contextSummary.trim()).digest('hex').substring(0, 16);
  }
}

export const answerCacheService = new AnswerCacheService();
