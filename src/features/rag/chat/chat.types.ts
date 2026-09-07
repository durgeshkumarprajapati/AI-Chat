import { AttributionQuality } from '../citation/evidence-attribution';

export interface Citation {
  id?: string;
  index?: number;
  documentId: string;
  chunkId: string;
  filename: string;
  pageNumber: number;
  similarity: number;
  rerankScore?: number;
  sourceType?: 'vector' | 'keyword' | 'hybrid' | 'graph';
  knowledgeSourceType?: 'DOCUMENT' | 'WEB';
  webUrl?: string;
  canonicalUrl?: string;
  evidenceSnippet?: string;
  confidence?: number;
  confidenceLabel?: 'Strong' | 'Moderate' | 'Limited';
  answerSegmentIds?: string[];
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  summary?: string | null;
  knowledgeBaseId?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItem[];
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  answer: string;
  citations: Citation[];
  retrievedChunks: number;
  topSimilarity: number;
  retrievalQuery?: string;
  contextMessagesCount?: number;
  answerMode?: string;
  availableActions?: string[];
  cacheHit?: boolean;
  cacheType?: string;
  llmCalled?: boolean;
  embeddingCalled?: boolean;
  vectorSearchCalled?: boolean;
  keywordSearchCalled?: boolean;
  rerankCalled?: boolean;
  recoveryAttempted?: boolean;
  recoveryAttempts?: number;
  latencyTrace?: Record<string, number>;
  /** Deterministic attribution-quality classification (see evidence-attribution.ts's
   * classifyAttributionQuality doc comment) — only present for grounded/LLM-generated answers. */
  attributionQuality?: AttributionQuality;
  /** True when retrieved evidence existed but the answer cited none of it. */
  uncitedAnswer?: boolean;
  /** Correlation ID for this RAG request (see rag-execution-context.ts) — safe to expose: a random
   * hex suffix only, no user/document/query data. Useful for referencing a specific request in
   * support/ops discussions against server-side telemetry logs. */
  requestId?: string;
}

export type StreamEvent =
  | {
      type: 'start';
      conversationId: string;
      citations: Citation[];
      retrievedChunks: number;
      topSimilarity: number;
      retrievalQuery?: string;
      contextMessagesCount?: number;
      answerMode?: string;
      availableActions?: string[];
      cacheHit?: boolean;
      cacheType?: string;
      llmCalled?: boolean;
      embeddingCalled?: boolean;
      vectorSearchCalled?: boolean;
      keywordSearchCalled?: boolean;
      rerankCalled?: boolean;
      recoveryAttempted?: boolean;
      recoveryAttempts?: number;
    }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      conversationId: string;
      messageId: string;
      answer: string;
      citations: Citation[];
      latencyTrace?: Record<string, number>;
      attributionQuality?: AttributionQuality;
      uncitedAnswer?: boolean;
      requestId?: string;
    }
  | { type: 'error'; message: string };
