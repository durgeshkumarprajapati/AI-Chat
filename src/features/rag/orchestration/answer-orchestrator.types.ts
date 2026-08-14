import { Citation } from '../chat/chat.types';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export type AnswerMode =
  | 'GROUNDED'
  | 'DOCUMENT_GROUNDED'
  | 'WEB_GROUNDED'
  | 'MULTI_SOURCE_GROUNDED'
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
  sourceMode?: 'documents_only' | 'web_only' | 'all_sources';
  allowGeneralKnowledge?: boolean;
  requestedAnswerMode?: AnswerMode;
  searchAllKbs?: boolean;
  model?: string;
  skipCache?: boolean;
}
