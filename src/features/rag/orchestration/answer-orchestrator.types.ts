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

/**
 * Why graph retrieval was or wasn't attempted for this request — only reasons that correspond to
 * a real branch in AnswerOrchestratorService.maybeAugmentWithGraphContext. Not exposed to end
 * users; consumed internally (debug logging / the rag.retrieval.graph.completed telemetry event /
 * this field on OrchestratedAnswer, for any internal caller that wants structured access instead
 * of parsing log lines).
 */
export type GraphRetrievalReason =
  | 'FEATURE_DISABLED'
  | 'WEB_ONLY_MODE'
  | 'QUERY_NOT_GRAPH_RELEVANT'
  | 'QUERY_CLASSIFIED_GRAPH_RELEVANT'
  | 'ALWAYS_ON_ENABLED';

export type GraphRetrievalFailureCategory =
  | 'TIMEOUT'
  | 'DATABASE_FAILURE'
  | 'GRAPH_QUERY_FAILURE'
  | 'EVIDENCE_LOOKUP_FAILURE'
  | 'UNEXPECTED_ERROR';

/**
 * Structured, internal-only explanation of graph augmentation for this request. Present on
 * OrchestratedAnswer only when the request reached the standard (non-web-only, non-auto,
 * non-web-search/discovery) retrieval branch — see graph-context-augmenter.service.ts's own
 * source-mode documentation for exactly which modes that covers.
 *
 * `graphChunksInCitationCandidates` is deliberately named for what it actually measures: how many
 * graph-sourced chunks survived into the citation CANDIDATE list built by
 * citationService.mapCitationsToAnswer (which runs before LLM generation, on an empty answer
 * string). It is NOT proof the LLM's final generated text actually referenced a graph citation —
 * that would require the citation-finalization step in chat.service.ts (which parses the LLM's
 * raw output for citation markers, after generation) to also report which chunks survived, which
 * is a genuinely separate, currently-unbuilt capability. See this field's own doc comment.
 */
export interface GraphRetrievalExplanation {
  attempted: boolean;
  executed: boolean;
  reason: GraphRetrievalReason;
  priority?: boolean;
  success: boolean;
  failureCategory?: GraphRetrievalFailureCategory;
  entitiesFound: number;
  relationshipsFound: number;
  evidenceFound: number;
  chunksAdded: number;
  chunksDeduplicated: number;
  chunksDroppedByLimit: number;
  /** See this interface's own doc comment above — a citation-candidate count, not proof of final-
   * answer usage. Only populated once citations have actually been computed for this request. */
  graphChunksInCitationCandidates?: number;
  latencyMs?: number;
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
  /** Only present when the request reached the standard retrieval branch — see
   * GraphRetrievalExplanation's own doc comment for exactly what it covers and its limitations. */
  graphRetrieval?: GraphRetrievalExplanation;
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
