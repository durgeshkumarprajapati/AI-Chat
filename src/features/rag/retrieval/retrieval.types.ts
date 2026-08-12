export interface RetrievedChunk {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
}
