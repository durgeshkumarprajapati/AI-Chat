import { WebSearchOptions, WebSearchResult } from './web-search.types';

export interface WebSearchProvider {
  readonly id: string;
  readonly name: string;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
}
