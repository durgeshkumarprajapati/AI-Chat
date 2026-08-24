import { createHash } from 'crypto';
import { getRAGCacheProvider } from '@/features/rag/cache/rag-cache.factory';
import { WebSearchResponse } from '../web-intelligence.types';
import { WebIntelligenceConfigService } from '../web-intelligence.config';

export class WebSearchCacheService {
  private generateCacheKey(query: string): string {
    const hash = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
    return `web:v1:query:${hash}`;
  }

  public async get(query: string): Promise<WebSearchResponse | null> {
    try {
      const cacheProvider = getRAGCacheProvider();
      const key = this.generateCacheKey(query);
      const exactItem = await cacheProvider.getExact({
        userId: 'global-web',
        query: key
      });
      if (exactItem?.answer) {
        const parsed = JSON.parse(exactItem.answer) as WebSearchResponse;
        return {
          ...parsed,
          cached: true
        };
      }
    } catch {
      // Ignore cache lookup errors
    }
    return null;
  }

  public async set(query: string, response: WebSearchResponse): Promise<void> {
    try {
      const cacheProvider = getRAGCacheProvider();
      const key = this.generateCacheKey(query);
      const ttl = WebIntelligenceConfigService.getCacheTTLSeconds();

      await cacheProvider.setExact(
        {
          userId: 'global-web',
          query: key
        },
        {
          answer: JSON.stringify(response),
          citations: [],
          retrievedChunks: response.results.length,
          topSimilarity: 0.9,
          answerMode: 'WEB_GROUNDED',
          cachedAt: new Date().toISOString()
        },
        ttl
      );
    } catch {
      // Ignore cache write errors
    }
  }
}

export const webSearchCacheService = new WebSearchCacheService();
