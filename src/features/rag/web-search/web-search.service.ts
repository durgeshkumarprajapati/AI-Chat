import { env } from '@/config/env';
import { WebSearchOptions, WebSearchResult, WebSearchMetrics } from './web-search.types';
import { webSearchPlanner } from './web-search-planner';
import { searchEngineWebProvider, SearchEngineWebProvider } from './search-engine-web.provider';
import { webSourceQualityService } from './web-source-quality.service';
import { UrlNormalizer } from '../web-discovery/url-normalizer';
import { webFetcher } from '../web/web-fetcher';
import { webUrlValidator } from '../web/web-url.validator';
import { robotsPolicyService } from '../web-discovery/robots-policy';
import { webContentExtractor } from '../web/web-content-extractor';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import { createHash } from 'crypto';
import { cityExplorerTelemetryService } from '@/features/city-explorer/city-explorer.telemetry.service';

export class WebSearchService {
  private searchProvider: SearchEngineWebProvider;

  constructor(provider?: SearchEngineWebProvider) {
    this.searchProvider = provider || searchEngineWebProvider;
  }

  public setSearchProvider(provider: SearchEngineWebProvider): void {
    this.searchProvider = provider;
  }

  /**
   * Executes multi-query parallel web search, safe page fetching, passage extraction, deduplication, and quality reranking.
   */
  public async executeWebSearch(
    userId: string,
    question: string,
    options?: WebSearchOptions
  ): Promise<{ chunks: RetrievedChunk[]; metrics: WebSearchMetrics; searchQueries: string[] }> {
    const startTime = Date.now();
    const metrics: WebSearchMetrics = {
      decisionMs: 0,
      planningMs: 0,
      searchMs: 0,
      fetchMs: 0,
      extractionMs: 0,
      rerankMs: 0,
      totalMs: 0,
      queriesGenerated: 0,
      resultsFound: 0,
      pagesFetched: 0,
      passagesExtracted: 0,
      uniqueDomains: 0
    };

    if (!question || !question.trim()) {
      return { chunks: [], metrics, searchQueries: [] };
    }

    // 1. Planning phase
    const planStart = Date.now();
    const plan = webSearchPlanner.planSearchQueries(question);
    metrics.planningMs = Date.now() - planStart;
    metrics.queriesGenerated = plan.searchQueries.length;

    // 2. Parallel search phase across generated queries
    const searchStart = Date.now();
    const rawResultsArrays = await Promise.all(
      plan.searchQueries.map((q) => this.searchProvider.search(q, options).catch(() => []))
    );
    metrics.searchMs = Date.now() - searchStart;

    // 3. Flatten and deduplicate search results by URL
    const allResults: WebSearchResult[] = [];
    const seenUrls = new Set<string>();
    for (const arr of rawResultsArrays) {
      for (const res of arr) {
        const norm = UrlNormalizer.normalize(res.url);
        if (!seenUrls.has(norm)) {
          seenUrls.add(norm);
          allResults.push({ ...res, url: norm });
        }
      }
    }
    metrics.resultsFound = allResults.length;

    if (allResults.length === 0) {
      metrics.totalMs = Date.now() - startTime;
      return { chunks: [], metrics, searchQueries: plan.searchQueries };
    }

    // 4. Source quality & Authority ranking
    const rankedResults = webSourceQualityService.rankResults(allResults);

    // 5. Select top N pages for bounded fetching
    const maxPages = env.server?.WEB_SEARCH_MAX_SELECTED_SOURCES ?? 5;
    const selectedPages = rankedResults.slice(0, maxPages);

    // 6. Safe Bounded Parallel Fetching
    const fetchStart = Date.now();
    const fetchedContents: Array<{ url: string; title: string; html: string; domain: string; qualityScore: number }> = [];

    const maxConcurrent = env.server?.WEB_SEARCH_MAX_CONCURRENT_FETCHES ?? 3;
    for (let i = 0; i < selectedPages.length; i += maxConcurrent) {
      const batch = selectedPages.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (page) => {
          try {
            const safeUrl = await webUrlValidator.assertSafeUrl(page.url);
            const targetStr = safeUrl.toString();
            const allowed = await robotsPolicyService.isAllowed(targetStr);
            if (!allowed) {
              console.warn(`[WebSearchService] Robots.txt disallowed fetching ${targetStr}`);
              return null;
            }
            const fetched = await webFetcher.fetchUrl(targetStr);
            return {
              url: page.url,
              title: page.title,
              html: fetched.html,
              domain: page.domain || UrlNormalizer.getHostname(page.url),
              qualityScore: page.qualityScore || 0.5
            };
          } catch (err: any) {
            const durationMs = Date.now() - fetchStart;
            const statusCode = err?.statusCode || (typeof err?.message === 'string' && err.message.match(/\b(\d{3})\b/)?.[1] ? parseInt(err.message.match(/\b(\d{3})\b/)?.[1], 10) : 500);
            cityExplorerTelemetryService.logEvent('city_explorer.source.failed', page.domain || page.url, undefined, userId, {
              url: page.url,
              statusCode,
              reason: err?.message || 'Source fetch failed',
              durationMs
            });
            console.warn(`[WebSearchService] Safe fetch failed for ${page.url} (status ${statusCode}):`, err?.message || String(err));
            return null;
          }
        })
      );

      for (const item of batchResults) {
        if (item) fetchedContents.push(item);
      }
    }
    metrics.fetchMs = Date.now() - fetchStart;
    metrics.pagesFetched = fetchedContents.length;

    // 7. Passage extraction & chunking
    const extractStart = Date.now();
    const chunks: RetrievedChunk[] = [];
    const seenHashes = new Set<string>();
    const domainsSet = new Set<string>();

    for (const page of fetchedContents) {
      domainsSet.add(page.domain);
      const extracted = webContentExtractor.extract(page.html, page.url);
      const text = extracted.textContent || '';
      if (!text.trim()) continue;

      // Passage chunking (max ~500 chars per passage)
      const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 50);

      let chunkIndex = 0;
      for (const para of paragraphs.slice(0, 3)) {
        const hash = createHash('md5').update(para).digest('hex');
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);

        const tempDocId = `discovered-web-${createHash('md5').update(page.url).digest('hex').slice(0, 12)}`;
        const tempChunkId = `temp-web-${hash.slice(0, 16)}`;

        chunks.push({
          id: tempChunkId,
          documentId: tempDocId,
          filename: page.title || page.domain,
          chunkIndex,
          pageNumber: 1,
          content: para,
          tokenCount: Math.ceil(para.length / 4),
          similarity: page.qualityScore,
          rerankScore: page.qualityScore,
          sourceType: 'WEB',
          webUrl: page.url,
          canonicalUrl: extracted.canonicalUrl || page.url,
          metadata: {
            title: page.title,
            domain: page.domain,
            isTemporary: true,
            isWebSearch: true,
            qualityScore: page.qualityScore
          }
        });
        chunkIndex++;
      }
    }
    metrics.extractionMs = Date.now() - extractStart;
    metrics.passagesExtracted = chunks.length;
    metrics.uniqueDomains = domainsSet.size;

    // 8. Diversity Reranking (ensure evidence spans multiple domains when available)
    const rerankStart = Date.now();
    const domainCounts = new Map<string, number>();
    const diverseChunks: RetrievedChunk[] = [];

    for (const chunk of chunks) {
      const domain = (chunk.metadata?.domain as string) || 'unknown';
      const count = domainCounts.get(domain) || 0;
      if (count < 2) {
        domainCounts.set(domain, count + 1);
        diverseChunks.push(chunk);
      }
    }
    metrics.rerankMs = Date.now() - rerankStart;
    metrics.totalMs = Date.now() - startTime;

    return {
      chunks: diverseChunks.length > 0 ? diverseChunks : chunks,
      metrics,
      searchQueries: plan.searchQueries
    };
  }
}

export const webSearchService = new WebSearchService();
