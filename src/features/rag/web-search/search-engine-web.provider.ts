import { WebSearchProvider } from './web-search-provider.interface';
import { WebSearchOptions, WebSearchResult } from './web-search.types';
import { wikipediaDiscoveryProvider } from '../web-discovery/wikipedia.provider';
import { domainDiscoveryProvider } from '../web-discovery/domain-discovery.provider';
import { mediumDiscoveryProvider } from '../web-discovery/medium.provider';
import { UrlNormalizer } from '../web-discovery/url-normalizer';

export class SearchEngineWebProvider implements WebSearchProvider {
  public readonly id = 'search_engine_web_provider';
  public readonly name = 'Default Search Engine Web Provider';

  public async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    if (!query || !query.trim()) return [];

    const results: WebSearchResult[] = [];

    // 1. Target website specific search if provided
    if (options?.targetWebsite) {
      const domainRes = await domainDiscoveryProvider.search({
        query,
        targetWebsite: options.targetWebsite,
        maxResults: options.maxResultsPerQuery || 5
      });
      for (const item of domainRes) {
        results.push({
          title: item.title,
          url: item.url,
          canonicalUrl: item.canonicalUrl,
          snippet: item.snippet,
          domain: item.domain,
          sourceType: 'WEB',
          rank: item.score
        });
      }
      return results;
    }

    // 2. Multi-provider search across Wikipedia, Medium & public documentation
    const searchPromises: Promise<WebSearchResult[]>[] = [];

    // Wikipedia discovery
    searchPromises.push(
      wikipediaDiscoveryProvider.search({ query, maxResults: options?.maxResultsPerQuery || 3 }).then((items) =>
        items.map((item) => ({
          title: item.title,
          url: item.url,
          canonicalUrl: item.canonicalUrl,
          snippet: item.snippet,
          domain: item.domain,
          sourceType: 'WEB' as const,
          rank: item.score
        }))
      ).catch(() => [])
    );

    // Medium discovery if allowed
    if (!options?.allowedSources || options.allowedSources.includes('medium')) {
      searchPromises.push(
        mediumDiscoveryProvider.search({ query, maxResults: options?.maxResultsPerQuery || 3 }).then((items) =>
          items.map((item) => ({
            title: item.title,
            url: item.url,
            canonicalUrl: item.canonicalUrl,
            snippet: item.snippet,
            domain: item.domain,
            sourceType: 'WEB' as const,
            rank: item.score
          }))
        ).catch(() => [])
      );
    }

    const providerOutputs = await Promise.all(searchPromises);
    for (const batch of providerOutputs) {
      results.push(...batch);
    }

    // Deduplicate by normalized URL
    const seenUrls = new Set<string>();
    const deduplicated: WebSearchResult[] = [];
    for (const res of results) {
      const norm = UrlNormalizer.normalize(res.url);
      if (!seenUrls.has(norm)) {
        seenUrls.add(norm);
        deduplicated.push({
          ...res,
          url: norm
        });
      }
    }

    return deduplicated;
  }
}

export const searchEngineWebProvider = new SearchEngineWebProvider();
