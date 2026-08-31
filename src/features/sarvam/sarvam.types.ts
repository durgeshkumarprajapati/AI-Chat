export type SarvamSupportedLanguage =
  | 'hi-IN' // Hindi
  | 'bn-IN' // Bengali
  | 'ta-IN' // Tamil
  | 'te-IN' // Telugu
  | 'mr-IN' // Marathi
  | 'gu-IN' // Gujarati
  | 'kn-IN' // Kannada
  | 'ml-IN' // Malayalam
  | 'pa-IN' // Punjabi
  | 'or-IN' // Odia
  | 'en-IN'; // Indian English

export type SarvamBlockType = 'HEADING' | 'PARAGRAPH' | 'TABLE' | 'IMAGE' | 'HEADER' | 'FOOTER' | 'LIST_ITEM';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SarvamPageBlock {
  id: string;
  type: SarvamBlockType;
  content: string;
  pageNumber: number;
  order: number;
  confidence?: number;
  boundingBox?: BoundingBox;
  metadata?: Record<string, unknown>;
}

export interface NormalizedDigitisationDTO {
  pageNumber: number;
  language?: string;
  blocks: SarvamPageBlock[];
  tablesExtracted: number;
  imagesExtracted: number;
}

export interface DigitisationResultDTO {
  documentId: string;
  status: 'COMPLETED' | 'FAILED';
  pageCount: number;
  tableCount: number;
  blockCount: number;
  language?: string;
  pages: NormalizedDigitisationDTO[];
  errorMessage?: string;
  durationMs: number;
}

export interface TranslationRequestDTO {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  mode?: 'formal' | 'modern_colloquial' | 'classical_colloquial' | 'code_mixed';
  numeralsFormat?: 'native' | 'international';
  model?: string;
  userId?: string;
}

export interface TranslationResponseDTO {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  cached: boolean;
  durationMs: number;
}

export interface DocumentTranslationRequestInput {
  documentId: string;
  userId: string;
  sourceLanguage?: string;
  targetLanguages: string[];
}

export interface DocumentTranslationJobDTO {
  id: string;
  documentId: string;
  userId: string;
  sourceVersionId?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'STALE';
  jobId?: string | null;
  translatedTitle?: string | null;
  storageKey?: string | null;
  translatedText?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface LanguageDetectionResultDTO {
  language: string;
  isIndic: boolean;
  confidence: number;
}

export interface SarvamTelemetryEvent {
  event:
    | 'sarvam.request.started'
    | 'sarvam.request.completed'
    | 'sarvam.request.failed'
    | 'sarvam.digitisation.started'
    | 'sarvam.digitisation.completed'
    | 'sarvam.digitisation.failed'
    | 'sarvam.translation.started'
    | 'sarvam.translation.completed'
    | 'sarvam.translation.failed'
    | 'sarvam.document_translation.started'
    | 'sarvam.document_translation.completed'
    | 'sarvam.document_translation.failed'
    | 'sarvam.fallback.used';
  documentId?: string;
  tenantId?: string;
  operation?: string;
  durationMs?: number;
  status?: string;
  errorCategory?: string;
  error?: string;
  language?: string;
  pageCount?: number;
  retryCount?: number;
}
