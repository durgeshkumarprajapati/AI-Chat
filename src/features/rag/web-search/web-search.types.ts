export type QueryClassification =
  | 'DOCUMENT_SUFFICIENT'
  | 'WEB_REQUIRED'
  | 'WEB_OPTIONAL'
  | 'MULTI_SOURCE'
  | 'CLARIFICATION_REQUIRED';

export interface SearchDecisionResult {
  classification: QueryClassification;
  shouldSearchWeb: boolean;
  shouldSearchDocs: boolean;
  confidence: number;
  reasoning: string;
}

export interface SearchQueryPlan {
  originalQuery: string;
  searchQueries: string[];
  intentCategory: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  canonicalUrl?: string;
  snippet: string;
  domain: string;
  sourceType: 'WEB';
  publishedAt?: string;
  rank?: number;
  providerMetadata?: Record<string, unknown>;
  qualityScore?: number;
}

export interface WebSearchOptions {
  maxResultsPerQuery?: number;
  allowedSources?: string[];
  targetWebsite?: string;
  preferredDomains?: string[];
}

export interface WebSearchMetrics {
  decisionMs: number;
  planningMs: number;
  searchMs: number;
  fetchMs: number;
  extractionMs: number;
  rerankMs: number;
  totalMs: number;
  queriesGenerated: number;
  resultsFound: number;
  pagesFetched: number;
  passagesExtracted: number;
  uniqueDomains: number;
}
