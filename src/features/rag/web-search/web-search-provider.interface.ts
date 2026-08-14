import { WebSearchOptions, WebSearchResult } from './web-search.types';

export interface WebSearchProvider {
  readonly id: string;
  readonly name: string;
  search(_query: string, _options?: WebSearchOptions): Promise<WebSearchResult[]>;
}
