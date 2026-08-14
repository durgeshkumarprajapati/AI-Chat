import { WebDiscoveryProvider } from './web-discovery-provider.interface';
import { wikipediaDiscoveryProvider } from './wikipedia.provider';
import { mediumDiscoveryProvider } from './medium.provider';
import { domainDiscoveryProvider } from './domain-discovery.provider';
import { env } from '@/config/env';

export class TrustedSourceRegistry {
  private providers = new Map<string, WebDiscoveryProvider>();

  constructor() {
    this.register(wikipediaDiscoveryProvider);
    this.register(mediumDiscoveryProvider);
    this.register(domainDiscoveryProvider);
  }

  public register(provider: WebDiscoveryProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): WebDiscoveryProvider | undefined {
    return this.providers.get(id);
  }

  public getActiveProviders(allowedSources?: string[]): WebDiscoveryProvider[] {
    const configuredSources = allowedSources || (env.server?.WEB_DISCOVERY_ALLOWED_SOURCES || 'wikipedia,medium').split(',');
    const sourceSet = new Set(configuredSources.map((s) => s.trim().toLowerCase()));

    const active: WebDiscoveryProvider[] = [];
    for (const [id, provider] of this.providers.entries()) {
      if (id === 'domain_discovery') continue; // Handled separately when target website is supplied
      if (sourceSet.has(id.toLowerCase())) {
        active.push(provider);
      }
    }

    return active;
  }
}

export const trustedSourceRegistry = new TrustedSourceRegistry();
