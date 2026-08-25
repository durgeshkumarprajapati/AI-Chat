export interface RetrievedChunk {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  similarity: number;
  vectorScore?: number;
  keywordScore?: number;
  hybridScore?: number;
  rerankScore?: number;
  retrievalSource?: 'vector' | 'keyword' | 'hybrid';
  sourceType?: 'DOCUMENT' | 'WEB';
  webUrl?: string;
  canonicalUrl?: string;
  metadata: Record<string, unknown>;
  /** Phase 69B: the source document's createdAt, additively selected for freshness reranking signals. Optional — unused unless the intelligence-aware reranker is active. */
  documentCreatedAt?: string;
}

export interface RetrievalOptions {
  knowledgeBaseId?: string;
  sourceMode?: 'documents_only' | 'web_only' | 'all_sources';
  includeVisualEvidence?: boolean;
  topK?: number;
  minSimilarity?: number;
  vectorK?: number;
  keywordK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  enableRerank?: boolean;
  forceRerank?: boolean;
  /** An already cached query embedding, used to avoid a second model invocation. */
  queryVector?: number[];
  /**
   * Optional Phase 69A metadata-aware filter: keeps only chunks whose denormalized
   * `metadata.documentType` (set at ingestion by the Document Intelligence pipeline) matches one
   * of these values. Legacy/undocumented chunks (no `documentType` in metadata) are always kept,
   * and the filter never zeroes out a non-empty candidate set. Undefined (the default) is a
   * complete no-op — no caller sets this yet, so existing retrieval behavior is unaffected.
   */
  documentTypeFilter?: string[];
  /**
   * Optional Phase 69B routing filter: keeps only chunks whose `documentId` is in this set.
   * Same never-zeroing, no-op-by-default contract as `documentTypeFilter`; composes with it.
   * Populated only internally by the orchestrator's document-routing step when confidence is
   * HIGH — never set by an external caller directly.
   */
  documentIdFilter?: string[];
}

export interface RetrievalMetrics {
  embeddingMs: number;
  vectorMs: number;
  keywordMs: number;
  mergeMs: number;
  rerankMs: number;
  totalMs: number;
}

export interface RetrievalTrace {
  query: string;
  vectorCandidatesCount: number;
  keywordCandidatesCount: number;
  mergedCandidatesCount: number;
  deduplicatedCandidatesCount: number;
  rerankedCandidatesCount: number;
  finalChunksCount: number;
  metrics: RetrievalMetrics;
}

export interface RetrievalResultWithTrace {
  chunks: RetrievedChunk[];
  trace: RetrievalTrace;
}
