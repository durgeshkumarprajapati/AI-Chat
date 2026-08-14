import { env } from '@/config/env';
import { WebDiscoveryCandidate, WebDiscoveryQueryOptions, WebDiscoverySearchResult } from './trusted-source.types';
import { trustedSourceRegistry } from './trusted-source.registry';
import { domainDiscoveryProvider } from './domain-discovery.provider';
import { webUrlValidator } from '../web/web-url.validator';
import { webFetcher } from '../web/web-fetcher';
import { webContentExtractor } from '../web/web-content-extractor';
import { robotsPolicyService } from './robots-policy';
import { UrlNormalizer } from './url-normalizer';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export class WebDiscoveryService {
  /**
   * Discovers relevant web pages from user-specified domain or trusted public sources.
   */
  public async discover(options: WebDiscoveryQueryOptions): Promise<WebDiscoverySearchResult[]> {
    if (!env.server?.WEB_DISCOVERY_ENABLED) {
      return [];
    }

    const results: WebDiscoverySearchResult[] = [];
    const seenUrls = new Set<string>();

    // 1. Prioritize user-provided website/domain if specified
    if (options.targetWebsite?.trim()) {
      const domainResults = await domainDiscoveryProvider.search(options);
      for (const item of domainResults) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          results.push(item);
        }
      }
    }

    // 2. If no user domain, or if user domain returned fewer than maxResults, query trusted sources
    const maxResults = options.maxResults || (env.server?.WEB_DISCOVERY_MAX_RESULTS ?? 5);
    if (results.length < maxResults) {
      const activeProviders = trustedSourceRegistry.getActiveProviders(options.allowedSources);

      for (const provider of activeProviders) {
        if (results.length >= maxResults) break;
        const providerResults = await provider.search({
          ...options,
          maxResults: maxResults - results.length
        });

        for (const item of providerResults) {
          if (!seenUrls.has(item.url) && results.length < maxResults) {
            seenUrls.add(item.url);
            results.push(item);
          }
        }
      }
    }

    return results;
  }

  /**
   * Discovers relevant pages, fetches their text safely, extracts content,
   * and returns temporary RAG candidates ready for hybrid retrieval & reranking.
   */
  public async discoverAndFetchCandidates(
    _userId: string,
    options: WebDiscoveryQueryOptions
  ): Promise<{ chunks: RetrievedChunk[]; candidates: WebDiscoveryCandidate[]; metrics: Record<string, number> }> {
    const discoveryStart = Date.now();
    const searchResults = await this.discover(options);
    const discoveryMs = Date.now() - discoveryStart;

    const fetchStart = Date.now();
    const candidates: WebDiscoveryCandidate[] = [];
    const chunks: RetrievedChunk[] = [];
    const maxPages = options.maxPagesPerDomain || 3;

    let pageIdx = 0;
    for (const item of searchResults) {
      if (pageIdx >= maxPages) break;

      try {
        // SSRF URL validation
        const safeUrl = await webUrlValidator.assertSafeUrl(item.url);
        const normUrl = UrlNormalizer.normalize(safeUrl.toString());

        // Robots.txt check
        if (!options.skipRobotsCheck) {
          const allowed = await robotsPolicyService.isAllowed(normUrl);
          if (!allowed) {
            console.warn(`[WebDiscoveryService] Skipping ${normUrl} - disallowed by robots.txt`);
            continue;
          }
        }

        // Bounded fetch
        const fetchRes = await webFetcher.fetchUrl(normUrl);
        const extractRes = webContentExtractor.extract(fetchRes.html, fetchRes.finalUrl);

        if (!extractRes.textContent || extractRes.textContent.length < 50) {
          continue;
        }

        const candidate: WebDiscoveryCandidate = {
          ...item,
          url: normUrl,
          canonicalUrl: extractRes.canonicalUrl || normUrl,
          title: extractRes.title || item.title,
          snippet: extractRes.textContent.slice(0, 200).trim(),
          textContent: extractRes.textContent,
          contentHash: extractRes.contentHash,
          fetchedAt: new Date().toISOString(),
          isTemporary: true
        };

        candidates.push(candidate);

        // Chunk extracted text for RAG retrieval
        const rawParagraphs = extractRes.textContent.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
        const pageChunks = rawParagraphs.slice(0, 4);

        for (let cIdx = 0; cIdx < pageChunks.length; cIdx++) {
          const content = pageChunks[cIdx]!.trim();
          const chunkId = `temp-web-${pageIdx + 1}-${cIdx + 1}`;

          chunks.push({
            id: chunkId,
            documentId: `discovered-web-${pageIdx + 1}`,
            filename: candidate.title,
            chunkIndex: cIdx,
            pageNumber: 1,
            content,
            tokenCount: Math.ceil(content.length / 4),
            similarity: 0.85,
            vectorScore: 0.85,
            keywordScore: 0.80,
            hybridScore: 0.85,
            retrievalSource: 'hybrid',
            sourceType: 'WEB',
            webUrl: candidate.url,
            canonicalUrl: candidate.canonicalUrl || undefined,
            metadata: {
              sourceType: 'WEB',
              isWebDiscovery: true,
              isTemporary: true,
              domain: candidate.domain,
              contentHash: candidate.contentHash,
              title: candidate.title
            }
          });
        }

        pageIdx++;
      } catch (err) {
        console.warn(`[WebDiscoveryService] Failed to fetch candidate ${item.url}:`, err instanceof Error ? err.message : String(err));
      }
    }

    const fetchMs = Date.now() - fetchStart;

    return {
      chunks,
      candidates,
      metrics: {
        discoveryMs,
        fetchMs,
        discoveredCount: searchResults.length,
        fetchedCount: candidates.length,
        chunksCount: chunks.length
      }
    };
  }
}

export const webDiscoveryService = new WebDiscoveryService();
