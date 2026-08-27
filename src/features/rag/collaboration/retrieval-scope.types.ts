export type RagConversationTypeValue = 'PRIVATE' | 'GROUP' | 'PROJECT';

/**
 * A normalized, already-authorized retrieval scope. Every field beyond `userId`/`conversationId`/
 * `conversationType` is a SECURITY boundary, not a ranking hint — this is intentionally distinct
 * from Phase 69A/69B's soft, never-zeroing `documentIdFilter`/`documentTypeFilter` (which fall
 * back to broader results if narrowing would empty them). A `RetrievalScope` is only ever produced
 * by `ScopeResolverService.resolveScope()`, which authorizes BEFORE any retrieval happens.
 */
export interface RetrievalScope {
  userId: string;
  conversationId: string;
  conversationType: RagConversationTypeValue;
  projectId?: string;

  /**
   * undefined = unrestricted (PRIVATE only — the requesting user's own document set, matching
   * today's pre-Phase-71 behavior exactly). Defined (including `[]`) = a hard allow-list; `[]`
   * means authorized to see zero documents, never "unrestricted".
   */
  authorizedDocumentIds?: string[];
  authorizedKnowledgeBaseIds?: string[];

  allowWebSearch: boolean;
  /** Reserved for Phase 71D's graph retrieval wiring — currently unused/no-op. */
  allowKnowledgeGraph: boolean;

  /**
   * True for GROUP/PROJECT (authorizedDocumentIds/authorizedKnowledgeBaseIds must be enforced as
   * HARD, zero-result-on-empty-set filters). Always false for PRIVATE, where neither field above
   * is ever set — this makes "zero behavior change for PRIVATE" provable by construction: the
   * hard-filter code path in the orchestration wrapper is never entered for PRIVATE scopes.
   */
  isHardScoped: boolean;
}
