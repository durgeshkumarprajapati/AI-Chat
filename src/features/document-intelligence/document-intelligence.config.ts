import { env } from '@/config/env';

export interface DocumentIntelligenceConfig {
  enabled: boolean;
  layoutAnalysisEnabled: boolean;
  semanticChunkingEnabled: boolean;
  metadataExtractionEnabled: boolean;
  classificationEnabled: boolean;
  legacyFallbackEnabled: boolean;
  timeoutMs: number;
  maxProcessingRetries: number;
  semanticChunkMaxTokens: number;
  semanticChunkOverlapTokens: number;
}

export function getDocumentIntelligenceConfig(): DocumentIntelligenceConfig {
  return {
    enabled: env.server?.DOCUMENT_INTELLIGENCE_ENABLED ?? false,
    layoutAnalysisEnabled: env.server?.DOCUMENT_LAYOUT_ANALYSIS_ENABLED ?? false,
    semanticChunkingEnabled: env.server?.DOCUMENT_SEMANTIC_CHUNKING_ENABLED ?? false,
    metadataExtractionEnabled: env.server?.DOCUMENT_METADATA_EXTRACTION_ENABLED ?? false,
    classificationEnabled: env.server?.DOCUMENT_CLASSIFICATION_ENABLED ?? false,
    legacyFallbackEnabled: env.server?.DOCUMENT_INTELLIGENCE_LEGACY_FALLBACK_ENABLED ?? true,
    timeoutMs: env.server?.DOCUMENT_INTELLIGENCE_TIMEOUT_MS ?? 120000,
    maxProcessingRetries: env.server?.DOCUMENT_MAX_PROCESSING_RETRIES ?? 3,
    semanticChunkMaxTokens: env.server?.SEMANTIC_CHUNK_MAX_TOKENS ?? 1000,
    semanticChunkOverlapTokens: env.server?.SEMANTIC_CHUNK_OVERLAP_TOKENS ?? 150
  };
}
