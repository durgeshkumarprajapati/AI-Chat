export interface WebSearchRequest {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: 'general' | 'news';
  timeoutMs?: number;
}

export interface WebSearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
  publishedAt?: Date;
  sourceDomain: string;
  rawPayload?: Record<string, unknown>;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  totalMs: number;
  provider: string;
  cached?: boolean;
}

export interface ProviderHealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latencyMs?: number;
}

export interface WebEvidence {
  sourceUrl: string;
  title: string;
  content: string;
  relevanceScore: number;
  trustScore: number;
  freshnessScore?: number;
  publishedAt?: Date;
  sourceDomain: string;
}

export interface WebSearchDecision {
  shouldSearchWeb: boolean;
  reason: string;
  confidenceThresholdUsed: number;
}
