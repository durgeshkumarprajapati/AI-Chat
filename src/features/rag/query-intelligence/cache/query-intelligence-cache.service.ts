import { redis } from '@/lib/redis';
import { createHash } from 'crypto';
import { QueryIntelligenceResult } from '../query-intelligence.types';

const TTL_SECONDS = 600; // short — query analysis, not an answer; no invalidation hook needed at this TTL

export class QueryIntelligenceCacheService {
  private key(userId: string, knowledgeBaseId: string | undefined, question: string): string {
    const hash = createHash('sha256').update(question.trim().toLowerCase()).digest('hex');
    return `rag:qintel:${userId}:${knowledgeBaseId || 'global'}:${hash}`;
  }

  public async get(userId: string, knowledgeBaseId: string | undefined, question: string): Promise<QueryIntelligenceResult | null> {
    try {
      return await redis.getJson<QueryIntelligenceResult>(this.key(userId, knowledgeBaseId, question));
    } catch {
      return null;
    }
  }

  public async set(userId: string, knowledgeBaseId: string | undefined, question: string, result: QueryIntelligenceResult): Promise<void> {
    try {
      await redis.setJson(this.key(userId, knowledgeBaseId, question), result, TTL_SECONDS);
    } catch {
      // best-effort only
    }
  }
}

export const queryIntelligenceCacheService = new QueryIntelligenceCacheService();
