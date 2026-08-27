export type MultimodalContentType =
  | 'TEXT'
  | 'OCR_TEXT'
  | 'TABLE'
  | 'IMAGE'
  | 'CHART'
  | 'DIAGRAM';

export interface MultimodalChunkMetadata {
  contentType: MultimodalContentType;
  pageNumber?: number;
  extractionConfidence?: number;
  sourceReference: string;
  tableIndex?: number;
  imageIndex?: number;
  chartIndex?: number;
  isUntrustedEvidence: boolean;
  documentType?: string;
  chunkingStrategy: 'multimodal_intelligence';
}

export interface ExtractedTableDTO {
  id?: string;
  documentId?: string;
  pageNumber: number;
  tableIndex: number;
  title?: string;
  headers: string[];
  rows: string[][];
  markdownRepresentation: string;
  structuredJson?: Record<string, unknown>;
  extractionConfidence: number;
  extractionProvider: string;
}

export interface ExtractedImageDTO {
  id?: string;
  documentId?: string;
  pageNumber: number;
  imageIndex: number;
  storageKey?: string;
  mimeType?: string;
  ocrText?: string;
  ocrProvider?: string;
  visionDescription?: string;
  visionEntities?: string[];
  visionProvider?: string;
  visionConfidence?: number;
}

export interface ExtractedChartDTO {
  id?: string;
  documentId?: string;
  pageNumber: number;
  chartIndex: number;
  storageKey?: string;
  chartType?: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'flow' | 'architecture' | 'other';
  description?: string;
  extractedDataPoints?: Array<{ label: string; value: number | string }>;
  confidence?: number;
  provider?: string;
}

export interface MultimodalDocumentAnalysisResult {
  handled: boolean;
  reason?: string;
  tablesExtracted: number;
  imagesFound: number;
  imagesAnalyzed: number;
  chartsExtracted: number;
  ocrPagesProcessed: number;
  durationMs: number;
}
