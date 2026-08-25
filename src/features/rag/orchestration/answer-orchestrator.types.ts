import { Citation } from '../chat/chat.types';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export type AnswerMode =
  | 'GROUNDED'
  | 'DOCUMENT_GROUNDED'
  | 'WEB_GROUNDED'
  | 'MULTI_SOURCE_GROUNDED'
  | 'WEB_DISCOVERY_GROUNDED'
  | 'WEB_SEARCH_GROUNDED'
  | 'RETRIEVAL_RECOVERY'
  | 'GENERAL_KNOWLEDGE'
  | 'NO_DOCUMENT_EVIDENCE'
  | 'CLARIFICATION_REQUIRED';

export type UserAction =
  | 'GENERAL_KNOWLEDGE'
  | 'SEARCH_ALL_KNOWLEDGE_BASES'
  | 'REFINE_QUERY';

export interface EvidenceAssessmentResult {
  hasStrongEvidence: boolean;
  retrievedChunkCount: number;
  topSimilarity: number;
  avgSimilarity: number;
  isAmbiguousQuestion: boolean;
  suggestedAction?: UserAction;
}

export interface OrchestratedAnswer {
  conversationId: string;
  messageId?: string;
  answerMode: AnswerMode;
  availableActions?: UserAction[];
  answer: string;
  citations: Citation[];
  retrievedChunks: RetrievedChunk[];
  topSimilarity: number;
  retrievalQuery?: string;
  contextMessagesCount?: number;
  cacheHit: boolean;
  cacheType?: 'exact' | 'semantic' | 'none';
  llmCalled: boolean;
  embeddingCalled: boolean;
  vectorSearchCalled: boolean;
  keywordSearchCalled: boolean;
  rerankCalled: boolean;
  recoveryAttempted: boolean;
  recoveryAttempts: number;
  latencyTrace: Record<string, number>;
  sourceEvidenceFingerprint?: string;
}

export interface OrchestrationInput {
  userId: string;
  question: string;
  conversationId?: string;
  knowledgeBaseId?: string;
  sourceMode?: 'documents_only' | 'web_only' | 'all_sources' | 'web_discovery' | 'web_search' | 'auto';
  targetWebsite?: string;
  allowedSources?: string[];
  allowGeneralKnowledge?: boolean;
  requestedAnswerMode?: AnswerMode;
  searchAllKbs?: boolean;
  model?: string;
  skipCache?: boolean;
  /**
   * Optional Phase 69A metadata-aware filter (see RetrievalOptions.documentTypeFilter). No caller
   * sets this yet — it's a ready extension point. Whenever set, the RAG cache is bypassed
   * entirely for this request (read and write) to avoid a filtered answer bleeding into an
   * unfiltered cache scope, since this filter is intentionally not part of the cache key.
   */
  documentTypeFilter?: string[];
  /**
   * Optional Phase 69B document-routing filter (see RetrievalOptions.documentIdFilter). Populated
   * only internally by the orchestrator's own document-routing step when confidence is HIGH —
   * never set by an external caller. Bypasses the cache for the same reason as
   * `documentTypeFilter` (intentionally not part of the cache key).
   */
  documentIdFilter?: string[];
}
