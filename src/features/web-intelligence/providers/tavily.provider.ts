import { WebSearchProvider } from './web-search.provider';
import { WebSearchRequest, WebSearchResponse, WebSearchResult, ProviderHealthStatus } from '../web-intelligence.types';
import { WebIntelligenceConfigService } from '../web-intelligence.config';

export class TavilyProvider implements WebSearchProvider {
  public readonly name = 'tavily';

  public isConfigured(): boolean {
    const key = WebIntelligenceConfigService.getTavilyApiKey();
    return !!key && key.trim().length > 0;
  }

  public async search(request: WebSearchRequest): Promise<WebSearchResponse> {
    const startTime = Date.now();
    const apiKey = WebIntelligenceConfigService.getTavilyApiKey();

    if (!apiKey) {
      return {
        query: request.query,
        results: [],
        totalMs: Date.now() - startTime,
        provider: this.name
      };
    }

    const baseUrl = WebIntelligenceConfigService.getTavilyBaseUrl();
    const timeoutMs = request.timeoutMs || WebIntelligenceConfigService.getSearchTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: request.query,
          max_results: request.maxResults || WebIntelligenceConfigService.getMaxResults(),
          search_depth: request.searchDepth || 'basic',
          include_domains: request.includeDomains,
          exclude_domains: request.excludeDomains,
          topic: request.topic || 'general'
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        return {
          query: request.query,
          results: [],
          totalMs: Date.now() - startTime,
          provider: this.name
        };
      }

      const data: any = await response.json();
      const rawResults = Array.isArray(data.results) ? data.results : [];

      const normalizedResults: WebSearchResult[] = rawResults.map((item: any) => {
        let domain = 'external';
        try {
          domain = new URL(item.url).hostname.replace(/^www\./, '');
        } catch {
          // ignore
        }

        return {
          url: item.url || '',
          title: item.title || 'Web Search Result',
          content: item.content || item.snippet || '',
          score: typeof item.score === 'number' ? item.score : 0.8,
          publishedAt: item.published_date ? new Date(item.published_date) : undefined,
          sourceDomain: domain,
          rawPayload: item
        };
      });

      return {
        query: request.query,
        results: normalizedResults,
        totalMs: Date.now() - startTime,
        provider: this.name
      };
    } catch {
      clearTimeout(timer);
      return {
        query: request.query,
        results: [],
        totalMs: Date.now() - startTime,
        provider: this.name
      };
    }
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) {
      return {
        status: 'unhealthy',
        message: 'TAVILY_API_KEY is not configured in server environment.'
      };
    }
    return {
      status: 'healthy',
      message: 'Tavily provider is configured and available.'
    };
  }
}

export const tavilyProvider = new TavilyProvider();
