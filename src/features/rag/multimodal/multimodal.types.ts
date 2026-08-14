export type VisualContentType =
  | 'TABLE'
  | 'IMAGE'
  | 'CHART'
  | 'DIAGRAM'
  | 'OCR'
  | 'SCANNED_PAGE';

export interface VisualEvidenceItem {
  id: string;
  documentId: string;
  pageNumber: number;
  type: VisualContentType;
  storageKey?: string | null;
  contentHash?: string | null;
  caption?: string | null;
  ocrText?: string | null;
  metadata?: Record<string, unknown> | null;
  width?: number | null;
  height?: number | null;
  confidence?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MultimodalAnalysisResult {
  visuals: VisualEvidenceItem[];
  chunks: Array<{
    content: string;
    pageNumber: number;
    visualType: VisualContentType;
    visualId: string;
    metadata: Record<string, unknown>;
  }>;
  metrics: MultimodalMetrics;
}

export interface MultimodalMetrics {
  extractionMs: number;
  ocrMs: number;
  tableExtractionMs: number;
  visionMs: number;
  embeddingMs: number;
  totalMs: number;
  imagesExtracted: number;
  tablesExtracted: number;
  ocrPagesProcessed: number;
  visionCallsMade: number;
}
