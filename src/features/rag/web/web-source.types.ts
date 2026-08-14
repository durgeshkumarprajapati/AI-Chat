export type WebSourceStatus = 'ACTIVE' | 'FETCHING' | 'FAILED' | 'DISABLED';

export interface WebSourceDetail {
  id: string;
  userId: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  status: string;
  contentHash?: string | null;
  fetchedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  knowledgeBases?: Array<{ id: string; name: string }>;
}

export interface CreateWebSourceInput {
  url: string;
  knowledgeBaseId?: string;
}

export interface RefreshWebSourceResult {
  status: 'UNCHANGED' | 'REFRESHED' | 'FAILED';
  contentHash?: string;
  fetchedAt?: string;
  message?: string;
}
