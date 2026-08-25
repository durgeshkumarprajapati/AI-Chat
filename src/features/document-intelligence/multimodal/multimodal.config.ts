import { env } from '@/config/env';

export interface MultimodalConfig {
  enabled: boolean;
  ocrEnabled: boolean;
  ocrProvider: string;
  tableExtractionEnabled: boolean;
  tableProvider: string;
  imageAnalysisEnabled: boolean;
  visionProvider: string;
  chartExtractionEnabled: boolean;
  timeoutMs: number;
  maxImagesPerDocument: number;
  maxTablesPerDocument: number;
  maxRetries: number;
}

export function getMultimodalConfig(): MultimodalConfig {
  return {
    enabled: env.server?.DOCUMENT_MULTIMODAL_ENABLED ?? false,
    ocrEnabled: env.server?.DOCUMENT_OCR_ENABLED ?? false,
    ocrProvider: env.server?.DOCUMENT_OCR_PROVIDER ?? 'mock',
    tableExtractionEnabled: env.server?.DOCUMENT_TABLE_EXTRACTION_ENABLED ?? false,
    tableProvider: env.server?.DOCUMENT_TABLE_PROVIDER ?? 'mock',
    imageAnalysisEnabled: env.server?.DOCUMENT_IMAGE_ANALYSIS_ENABLED ?? false,
    visionProvider: env.server?.DOCUMENT_VISION_PROVIDER ?? 'mock',
    chartExtractionEnabled: env.server?.DOCUMENT_CHART_EXTRACTION_ENABLED ?? false,
    timeoutMs: env.server?.DOCUMENT_MULTIMODAL_TIMEOUT_MS ?? 60000,
    maxImagesPerDocument: env.server?.DOCUMENT_MAX_IMAGES_PER_DOCUMENT ?? 50,
    maxTablesPerDocument: env.server?.DOCUMENT_MAX_TABLES_PER_DOCUMENT ?? 100,
    maxRetries: env.server?.DOCUMENT_MULTIMODAL_MAX_RETRIES ?? 3
  };
}
