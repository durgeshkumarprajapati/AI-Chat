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
}

export interface CacheKeyOptions {
  userId: string;
  knowledgeBaseId?: string | null;
  model?: string;
  answerMode?: string;
  query: string;
  contextSummary?: string | null;
}
