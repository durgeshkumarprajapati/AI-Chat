import { env } from '@/config/env';

export class WebIntelligenceConfigService {
  public static isWebSearchEnabled(): boolean {
    const envVal = process.env.WEB_SEARCH_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.WEB_SEARCH_ENABLED ?? true;
  }

  public static getProvider(): string {
    return env.server?.WEB_SEARCH_PROVIDER || process.env.WEB_SEARCH_PROVIDER || 'tavily';
  }

  public static getTavilyApiKey(): string | undefined {
    return env.server?.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  }

  public static getTavilyBaseUrl(): string {
    return env.server?.TAVILY_BASE_URL || process.env.TAVILY_BASE_URL || 'https://api.tavily.com';
  }

  public static getMaxResults(): number {
    const envVal = process.env.WEB_SEARCH_MAX_RESULTS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.WEB_SEARCH_MAX_RESULTS ?? 5;
  }

  public static getSearchTimeoutMs(): number {
    const envVal = process.env.WEB_SEARCH_TIMEOUT_MS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.WEB_SEARCH_TIMEOUT_MS ?? 10000;
  }

  public static isCrawlerEnabled(): boolean {
    const envVal = process.env.WEB_CRAWLER_ENABLED;
    if (envVal !== undefined) return envVal !== 'false';
    return env.server?.WEB_CRAWLER_ENABLED ?? true;
  }

  public static getMaxCrawlerPages(): number {
    const envVal = process.env.WEB_CRAWLER_MAX_PAGES;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.WEB_CRAWLER_MAX_PAGES ?? 5;
  }

  public static getCrawlerTimeoutMs(): number {
    const envVal = process.env.WEB_CRAWLER_TIMEOUT_MS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.WEB_CRAWLER_TIMEOUT_MS ?? 15000;
  }

  public static getCacheTTLSeconds(): number {
    const envVal = process.env.WEB_RAG_CACHE_TTL_SECONDS;
    if (envVal !== undefined) return Number(envVal);
    return env.server?.WEB_RAG_CACHE_TTL_SECONDS ?? 3600;
  }
}
