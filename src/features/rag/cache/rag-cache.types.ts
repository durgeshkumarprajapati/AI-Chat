import { Citation } from '../chat/chat.types';

export interface ExactCacheItem {
  answer: string;
  citations: Citation[];
  retrievedChunks: number;
  topSimilarity: number;
  answerMode: string;
  retrievalQuery?: string;
  contextMessagesCount?: number;
  cachedAt: string;
}

export interface EmbeddingCacheItem {
  vector: number[];
  provider: string;
  model: string;
  cachedAt: string;
}

export interface SemanticCacheItem extends ExactCacheItem {
  queryVector: number[];
  question: string;
  userId: string;
  knowledgeBaseId?: string | null;
  model: string;
  answerMode: string;
  validEvidence: boolean;
  invalidated?: boolean;
  sourceDocumentIds?: string[];
  sourceFingerprint?: string;
  expiresAt?: string;
}

export interface SemanticCacheLookupResult {
  item: SemanticCacheItem | null;
  similarity: number | null;
  candidateCount: number;
  sourceFingerprint?: string;
}

export interface CacheKeyOptions {
  userId: string;
  knowledgeBaseId?: string | null;
  sourceMode?: string;
  model?: string;
  answerMode?: string;
  query: string;
  contextSummary?: string | null;
}
