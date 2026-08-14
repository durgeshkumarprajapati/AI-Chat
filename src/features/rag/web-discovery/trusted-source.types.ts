export interface WebDiscoverySearchResult {
  url: string;
  canonicalUrl?: string | null;
  title: string;
  snippet: string;
  source: string; // e.g. 'wikipedia', 'medium', 'user_website'
  sourceType: 'WEB';
  domain: string;
  score?: number;
  relevance?: number;
  fetchedAt?: string;
  contentHash?: string;
}

export interface WebDiscoveryCandidate extends WebDiscoverySearchResult {
  textContent?: string;
  chunks?: Array<{ content: string; tokenCount: number }>;
  isTemporary: boolean;
}

export interface TrustedSourceConfig {
  id: string;
  name: string;
  domain: string;
  isEnabled: boolean;
  maxResults?: number;
}

export interface WebDiscoveryQueryOptions {
  query: string;
  targetWebsite?: string;
  allowedSources?: string[];
  maxResults?: number;
  maxPagesPerDomain?: number;
  skipRobotsCheck?: boolean;
}
