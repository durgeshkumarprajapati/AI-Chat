import { WebDiscoveryProvider } from './web-discovery-provider.interface';
import { WebDiscoveryQueryOptions, WebDiscoverySearchResult } from './trusted-source.types';
import { UrlNormalizer } from './url-normalizer';

export class WikipediaDiscoveryProvider implements WebDiscoveryProvider {
  public readonly id = 'wikipedia';
  public readonly name = 'Wikipedia';
  public readonly defaultDomain = 'en.wikipedia.org';

  public async search(options: WebDiscoveryQueryOptions): Promise<WebDiscoverySearchResult[]> {
    const limit = options.maxResults || 5;
    const query = options.query.trim();
    if (!query) return [];

    try {
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=&format=json&srlimit=${limit}`;

      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'DocumentAIRAGBot/1.0 (https://github.com/durgeshkumarprajapati/AI-Chat)' },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) return [];

      const data = await response.json();
      const searchItems = data?.query?.search || [];

      const results: WebDiscoverySearchResult[] = [];
      for (const item of searchItems) {
        const title = item.title;
        const rawSnippet = item.snippet || '';
        const cleanSnippet = rawSnippet.replace(/<[^>]*>/g, '').trim();

        const pageUrl = UrlNormalizer.normalize(
          `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
        );

        results.push({
          url: pageUrl,
          canonicalUrl: pageUrl,
          title,
          snippet: cleanSnippet,
          source: 'wikipedia',
          sourceType: 'WEB',
          domain: 'en.wikipedia.org',
          score: 0.95
        });
      }

      return results;
    } catch (err) {
      console.warn('[WikipediaDiscoveryProvider] Search failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
}

export const wikipediaDiscoveryProvider = new WikipediaDiscoveryProvider();
