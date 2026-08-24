import { WebSearchRequest, WebSearchResponse, ProviderHealthStatus } from '../web-intelligence.types';

export interface WebSearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(_request: WebSearchRequest): Promise<WebSearchResponse>;
  healthCheck(): Promise<ProviderHealthStatus>;
}
