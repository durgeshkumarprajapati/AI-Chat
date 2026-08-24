import { getRAGCacheProvider } from './rag-cache.factory';
import { HybridRAGResult } from '../rag.types';

export class RAGCacheService {
  public async getCachedResult(
    userId: string,
    query: string,
    kbId?: string
  ): Promise<HybridRAGResult | null> {
    try {
      const cacheProvider = getRAGCacheProvider();
      const exactItem = await cacheProvider.getExact({
        userId,
        knowledgeBaseId: kbId,
        query
      });
      if (exactItem?.answer) {
        return {
          answer: exactItem.answer,
          citations: (exactItem.citations || []).map((c) => ({
            documentId: c.documentId,
            chunkId: undefined,
            title: c.filename,
            relevanceScore: c.similarity,
            sourceType: 'VECTOR' as const
          })),
          confidence: {
            score: 0.9,
            level: 'HIGH',
            reason: 'Exact cache hit'
          },
          retrievalMetadata: {
            strategy: 'HYBRID',
            retrievedCount: exactItem.retrievedChunks || 0,
            finalContextCount: exactItem.retrievedChunks || 0,
            latencyMs: 0,
            intent: 'FACTUAL',
            usedMultiQuery: false,
            provider: 'cache',
            usedFallback: false
          }
        };
      }
    } catch {
      // In-memory or cache miss fallback
    }
    return null;
  }

  public async setCachedResult(
    userId: string,
    query: string,
    result: HybridRAGResult,
    kbId?: string,
    ttlSeconds = 300
  ): Promise<void> {
    try {
      const cacheProvider = getRAGCacheProvider();
      await cacheProvider.setExact(
        {
          userId,
          knowledgeBaseId: kbId,
          query
        },
        {
          answer: result.answer,
          citations: result.citations.map((c) => ({
            documentId: c.documentId,
            chunkId: c.chunkId || '',
            filename: c.title,
            pageNumber: 1,
            similarity: c.relevanceScore || 0.8
          })),
          retrievedChunks: result.retrievalMetadata.retrievedCount,
          topSimilarity: 0.9,
          answerMode: 'GROUNDED',
          cachedAt: new Date().toISOString()
        },
        ttlSeconds
      );
    } catch {
      // Ignore cache write errors
    }
  }
}

export const ragCacheService = new RAGCacheService();
