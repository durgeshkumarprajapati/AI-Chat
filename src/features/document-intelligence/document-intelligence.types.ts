export type LayoutBlockType = 'heading' | 'paragraph' | 'list' | 'unknown';

export interface LayoutBlock {
  type: LayoutBlockType;
  text: string;
  pageNumber: number;
}

// Only 'TEXT' is ever produced by Phase 69A. The remaining values are reserved so a future
// real table/OCR/vision implementation can populate them without another schema/type change.
export type ContentType = 'TEXT' | 'TABLE' | 'IMAGE' | 'CHART' | 'OCR_TEXT' | 'STRUCTURED_DATA';

export interface SemanticChunkMetadata {
  contentType: ContentType;
  sectionTitle?: string;
  chunkingStrategy: 'semantic';
  [key: string]: unknown;
}

// Structurally compatible with the worker's `Chunk` type (worker/src/chunking/document.chunker.ts)
// so the orchestrator's output can be handed directly to workerDocumentRepository.saveChunksTx.
export interface SemanticChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

// Minimal duck-typed mirror of worker/src/parsers/pdf.parser.ts's ParsedDocument — this module
// cannot import across the worker/src package boundary, so it declares a structurally
// compatible shape instead.
export interface ParsedDocumentLike {
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
}

export const CONTROLLED_DOCUMENT_TYPES = [
  'CONTRACT',
  'INVOICE',
  'REPORT',
  'ACADEMIC_PAPER',
  'RESUME',
  'EMAIL',
  'MANUAL',
  'PRESENTATION',
  'SPREADSHEET_EXPORT',
  'LEGAL_FILING',
  'OTHER'
] as const;

export type DocumentTypeValue = (typeof CONTROLLED_DOCUMENT_TYPES)[number];

export interface ExtractedDocumentMetadataDTO {
  title?: string;
  author?: string;
  createdDate?: string;
  keywords?: string[];
  summary?: string;
  language?: string;
}

export interface ClassificationResultDTO {
  documentType: DocumentTypeValue;
  confidence: number;
}

export interface DocumentIntelligenceInput {
  documentId: string;
  userId: string;
  parsedDocument: ParsedDocumentLike;
}

export interface DocumentIntelligenceRunResult {
  handled: boolean;
  reason?: string;
  chunks?: SemanticChunk[];
  documentType?: DocumentTypeValue;
  classificationConfidence?: number;
  extractedMetadata?: ExtractedDocumentMetadataDTO;
}
