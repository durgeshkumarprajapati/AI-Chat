import { WebSearchProvider } from './web-search.provider';
import { tavilyProvider } from './tavily.provider';
import { WebIntelligenceConfigService } from '../web-intelligence.config';

export class WebSearchProviderRegistry {
  private providers = new Map<string, WebSearchProvider>();

  constructor() {
    this.registerProvider(tavilyProvider);
  }

  public registerProvider(provider: WebSearchProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public getActiveProvider(): WebSearchProvider {
    const selectedName = WebIntelligenceConfigService.getProvider().toLowerCase();
    const provider = this.providers.get(selectedName);

    if (provider && provider.isConfigured()) {
      return provider;
    }

    // Default fallback to tavilyProvider if configured, or any configured provider
    for (const p of this.providers.values()) {
      if (p.isConfigured()) {
        return p;
      }
    }

    return tavilyProvider;
  }
}

export const webSearchProviderRegistry = new WebSearchProviderRegistry();
