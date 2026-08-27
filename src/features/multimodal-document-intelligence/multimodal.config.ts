import { env } from '@/config/env';

export interface MultimodalConfig {
  enabled: boolean;
  ocrEnabled: boolean;
  ocrProvider: string;
  ocrTimeoutMs: number;
  tableExtractionEnabled: boolean;
  maxTablesPerDocument: number;
  tableTimeoutMs: number;
  imageAnalysisEnabled: boolean;
  maxImagesPerDocument: number;
  imageTimeoutMs: number;
  chartAnalysisEnabled: boolean;
  maxChartsPerDocument: number;
  chartTimeoutMs: number;
  layoutEnabled: boolean;
  processingTimeoutMs: number;
  maxRetries: number;
  ragEnabled: boolean;
  minConfidence: number;
  retrievalMaxResults: number;
  legacyFallbackEnabled: boolean;
}

export function getMultimodalConfig(): MultimodalConfig {
  const s = env.server;
  return {
    enabled: s?.MULTIMODAL_DOCUMENT_INTELLIGENCE_ENABLED ?? true,
    ocrEnabled: s?.MULTIMODAL_OCR_ENABLED ?? true,
    ocrProvider: s?.MULTIMODAL_OCR_PROVIDER ?? 'auto',
    ocrTimeoutMs: s?.MULTIMODAL_OCR_TIMEOUT_MS ?? 60000,
    tableExtractionEnabled: s?.MULTIMODAL_TABLE_EXTRACTION_ENABLED ?? true,
    maxTablesPerDocument: s?.MULTIMODAL_TABLE_MAX_PER_DOCUMENT ?? 50,
    tableTimeoutMs: s?.MULTIMODAL_TABLE_TIMEOUT_MS ?? 30000,
    imageAnalysisEnabled: s?.MULTIMODAL_IMAGE_ANALYSIS_ENABLED ?? true,
    maxImagesPerDocument: s?.MULTIMODAL_IMAGE_MAX_PER_DOCUMENT ?? 30,
    imageTimeoutMs: s?.MULTIMODAL_IMAGE_TIMEOUT_MS ?? 60000,
    chartAnalysisEnabled: s?.MULTIMODAL_CHART_ANALYSIS_ENABLED ?? true,
    maxChartsPerDocument: s?.MULTIMODAL_CHART_MAX_PER_DOCUMENT ?? 30,
    chartTimeoutMs: s?.MULTIMODAL_CHART_TIMEOUT_MS ?? 60000,
    layoutEnabled: s?.MULTIMODAL_LAYOUT_ENABLED ?? true,
    processingTimeoutMs: s?.MULTIMODAL_PROCESSING_TIMEOUT_MS ?? 120000,
    maxRetries: s?.MULTIMODAL_MAX_RETRIES ?? 3,
    ragEnabled: s?.MULTIMODAL_RAG_ENABLED ?? true,
    minConfidence: s?.MULTIMODAL_MIN_CONFIDENCE ?? 0.70,
    retrievalMaxResults: s?.MULTIMODAL_RETRIEVAL_MAX_RESULTS ?? 10,
    legacyFallbackEnabled: s?.MULTIMODAL_LEGACY_FALLBACK_ENABLED ?? true
  };
}
