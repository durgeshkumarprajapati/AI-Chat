import type { PdfExtractionProvider } from './pdf-extraction-provider.js';
import { pdfJsExtractionProvider } from './pdfjs-extraction.provider.js';
import { pyMuPDFExtractionProvider } from './pymupdf-extraction.provider.js';

/**
 * PDF_EXTRACTION_PROVIDER defaults to 'pdfjs' — every existing deployment that doesn't set this
 * variable gets byte-identical behavior to before this change. Unlike embedding provider
 * selection (which has no fallback by design, per the TEI requirements), an unreachable PyMuPDF
 * service also does not silently fall back to pdfjs here — it fails clearly (via
 * PyMuPDFExtractionProvider.extract's own error), consistent with the same "never silently swap
 * behavior" principle applied to embeddings.
 */
export function getPdfExtractionProvider(): PdfExtractionProvider {
  const providerType = (process.env.PDF_EXTRACTION_PROVIDER || 'pdfjs').trim().toLowerCase();

  if (providerType === 'pdfjs') return pdfJsExtractionProvider;
  if (providerType === 'pymupdf') return pyMuPDFExtractionProvider;

  throw new Error(`Unknown PDF_EXTRACTION_PROVIDER: "${providerType}". Supported values: "pdfjs", "pymupdf".`);
}
