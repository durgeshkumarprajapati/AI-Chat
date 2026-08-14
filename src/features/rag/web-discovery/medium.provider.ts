import { WebDiscoveryProvider } from './web-discovery-provider.interface';
import { WebDiscoveryQueryOptions, WebDiscoverySearchResult } from './trusted-source.types';
import { UrlNormalizer } from './url-normalizer';

export class MediumDiscoveryProvider implements WebDiscoveryProvider {
  public readonly id = 'medium';
  public readonly name = 'Medium';
  public readonly defaultDomain = 'medium.com';

  public async search(options: WebDiscoveryQueryOptions): Promise<WebDiscoverySearchResult[]> {
    const limit = options.maxResults || 5;
    const query = options.query.trim();
    if (!query) return [];

    try {
      // Clean query to format tag query
      const firstWord = query.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'technology';
      const feedUrl = `https://medium.com/feed/tag/${encodeURIComponent(firstWord)}`;

      const response = await fetch(feedUrl, {
        headers: { 'User-Agent': 'DocumentAIRAGBot/1.0 (https://github.com/durgeshkumarprajapati/AI-Chat)' },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) return [];

      const xmlText = await response.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
      const linkRegex = /<link>(.*?)<\/link>/;
      const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;

      const results: WebDiscoverySearchResult[] = [];
      let match;

      while ((match = itemRegex.exec(xmlText)) !== null && results.length < limit) {
        const itemXml = match[1] || '';
        const titleMatch = titleRegex.exec(itemXml);
        const linkMatch = linkRegex.exec(itemXml);
        const descMatch = descRegex.exec(itemXml);

        const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
        const rawLink = linkMatch ? (linkMatch[1] || '').trim() : '';
        const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || '').trim() : '';
        const cleanSnippet = rawDesc.replace(/<[^>]*>/g, '').slice(0, 200).trim();

        if (title && rawLink) {
          const normUrl = UrlNormalizer.normalize(rawLink);
          results.push({
            url: normUrl,
            canonicalUrl: normUrl,
            title,
            snippet: cleanSnippet || `Medium article covering ${query}`,
            source: 'medium',
            sourceType: 'WEB',
            domain: 'medium.com',
            score: 0.85
          });
        }
      }

      return results;
    } catch (err) {
      console.warn('[MediumDiscoveryProvider] Search failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
}

export const mediumDiscoveryProvider = new MediumDiscoveryProvider();
