import { RetrievedChunk } from './retrieval/retrieval.types';

export type QueryIntent =
  | 'FACTUAL'
  | 'EXPLANATION'
  | 'CODE'
  | 'COMPARISON'
  | 'TROUBLESHOOTING'
  | 'SUMMARY'
  | 'UNKNOWN';

export interface QueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  rewrittenQuery?: string;
  intent: QueryIntent;
  shouldUseMultiQuery: boolean;
  generatedQueries?: string[];
  metadataFilters?: {
    knowledgeBaseId?: string;
    documentId?: string;
  };
}

export type CitationSourceType = 'VECTOR' | 'KEYWORD' | 'GRAPH';

export interface RAGCitation {
  documentId: string;
  chunkId?: string;
  title: string;
  relevanceScore?: number;
  sourceType: CitationSourceType;
  snippet?: string;
  url?: string;
}

export interface RAGConfidence {
  score: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  reason?: string;
}

export interface RetrievalPlan {
  useVector: boolean;
  useKeyword: boolean;
  useGraph: boolean;
  useQueryRewrite: boolean;
  useMultiQuery: boolean;
  useReranking: boolean;
  candidateLimit: number;
}

export interface HybridCandidate extends RetrievedChunk {
  score: number;
  vectorScore: number;
  keywordScore: number;
  graphScore: number;
  sources: CitationSourceType[];
  parentContent?: string;
  neighborBeforeContent?: string;
  neighborAfterContent?: string;
}

export interface HybridRAGOptions {
  knowledgeBaseId?: string;
  documentId?: string;
  sourceMode?:
    | 'documents_only'
    | 'web_only'
    | 'all'
    | 'all_sources'
    | 'web_search'
    | 'web_discovery'
    | 'auto'
    | 'DOCUMENTS'
    | 'WEB_SEARCH'
    | 'AUTO'
    | 'DOCUMENTS_AND_WEB'
    | 'WEB_DISCOVERY';
  topK?: number;
  minSimilarity?: number;
  localOnly?: boolean;
}

export interface HybridRAGResult {
  answer: string;
  citations: RAGCitation[];
  confidence: RAGConfidence;
  retrievalMetadata: {
    strategy: 'LEGACY' | 'HYBRID';
    retrievedCount: number;
    finalContextCount: number;
    latencyMs: number;
    intent: QueryIntent;
    usedMultiQuery: boolean;
    provider: string;
    usedFallback: boolean;
  };
}
