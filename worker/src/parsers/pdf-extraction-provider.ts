import type { ParsedDocument } from './pdf.parser.js';

/**
 * Phase 91.9 — extraction-provider abstraction. `PdfJsExtractionProvider` is a thin wrapper
 * around the pre-existing `WorkerPdfParser` (pdf.parser.ts) with zero behavior change; it remains
 * the default. `PyMuPDFExtractionProvider` is additive and only used when explicitly configured.
 */
export interface PdfExtractionProvider {
  extract(buffer: Buffer, documentId: string): Promise<ParsedDocument>;
}
