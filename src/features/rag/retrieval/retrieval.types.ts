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
}

export interface RetrievalOptions {
  knowledgeBaseId?: string;
  sourceMode?: 'documents_only' | 'web_only' | 'all_sources';
  topK?: number;
  minSimilarity?: number;
  vectorK?: number;
  keywordK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  enableRerank?: boolean;
  /** An already cached query embedding, used to avoid a second model invocation. */
  queryVector?: number[];
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
