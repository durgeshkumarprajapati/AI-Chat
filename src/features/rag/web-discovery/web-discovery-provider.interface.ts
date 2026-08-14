import { WebDiscoveryQueryOptions, WebDiscoverySearchResult } from './trusted-source.types';

export interface WebDiscoveryProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultDomain?: string;

  search(_options: WebDiscoveryQueryOptions): Promise<WebDiscoverySearchResult[]>;
}
