/**
 * Phase 91.9 — PDF extraction provider abstraction. Self-contained (no Prisma/env import chain).
 */
import { getPdfExtractionProvider } from '../../../worker/src/parsers/pdf-extraction-provider.factory';
import { PdfJsExtractionProvider } from '../../../worker/src/parsers/pdfjs-extraction.provider';
import { PyMuPDFExtractionProvider } from '../../../worker/src/parsers/pymupdf-extraction.provider';

describe('PDF extraction provider selection (PDF_EXTRACTION_PROVIDER)', () => {
  const original = process.env.PDF_EXTRACTION_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.PDF_EXTRACTION_PROVIDER;
    else process.env.PDF_EXTRACTION_PROVIDER = original;
  });

  it('defaults to PdfJsExtractionProvider when PDF_EXTRACTION_PROVIDER is unset (backward compatibility)', () => {
    delete process.env.PDF_EXTRACTION_PROVIDER;
    expect(getPdfExtractionProvider()).toBeInstanceOf(PdfJsExtractionProvider);
  });

  it('selects PdfJsExtractionProvider when explicitly set to "pdfjs"', () => {
    process.env.PDF_EXTRACTION_PROVIDER = 'pdfjs';
    expect(getPdfExtractionProvider()).toBeInstanceOf(PdfJsExtractionProvider);
  });

  it('selects PyMuPDFExtractionProvider when set to "pymupdf"', () => {
    process.env.PDF_EXTRACTION_PROVIDER = 'pymupdf';
    expect(getPdfExtractionProvider()).toBeInstanceOf(PyMuPDFExtractionProvider);
  });

  it('throws a clear error for an unknown provider value rather than silently defaulting', () => {
    process.env.PDF_EXTRACTION_PROVIDER = 'some-other-provider';
    expect(() => getPdfExtractionProvider()).toThrow('Unknown PDF_EXTRACTION_PROVIDER');
  });
});

describe('PyMuPDFExtractionProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws a clear, actionable error when PDF_SERVICE_URL is not configured — never silently uses pdfjs instead', async () => {
    const provider = new PyMuPDFExtractionProvider({ baseUrl: '' });
    await expect(provider.extract(Buffer.from('fake'), 'doc-1')).rejects.toThrow('requires PDF_SERVICE_URL to be configured');
  });

  it('maps a successful extraction response into the existing ParsedDocument shape', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documentId: 'doc-1',
        totalPages: 2,
        pages: [
          { pageNumber: 1, text: 'first page' },
          { pageNumber: 2, text: 'second page' }
        ],
        metadata: { extractionTimeMs: 42, ocrUsed: false }
      })
    }) as any;

    const provider = new PyMuPDFExtractionProvider({ baseUrl: 'http://localhost:8000', retryAttempts: 0 });
    const result = await provider.extract(Buffer.from('fake-pdf-bytes'), 'doc-1');

    expect(result).toEqual({
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: 'first page' },
        { pageNumber: 2, text: 'second page' }
      ]
    });
  });

  it('translates a 422 (no extractable text) into the same error message the existing pdfjs parser already throws', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error: 'no_extractable_text' })
    }) as any;

    const provider = new PyMuPDFExtractionProvider({ baseUrl: 'http://localhost:8000', retryAttempts: 0 });
    await expect(provider.extract(Buffer.from('fake'), 'doc-1')).rejects.toThrow(
      'No extractable text found in PDF document. Image-only or scanned PDFs require OCR processing.'
    );
  });

  it('does not retry a 422 (permanent, client-side error)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => '' }) as any;
    const provider = new PyMuPDFExtractionProvider({ baseUrl: 'http://localhost:8000', retryAttempts: 3 });

    await expect(provider.extract(Buffer.from('fake'), 'doc-1')).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 (transient/service overloaded) up to the configured attempt count', async () => {
    let calls = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      calls++;
      return { ok: false, status: 503, text: async () => 'overloaded' };
    }) as any;

    const provider = new PyMuPDFExtractionProvider({ baseUrl: 'http://localhost:8000', retryAttempts: 2 });
    await expect(provider.extract(Buffer.from('fake'), 'doc-1')).rejects.toThrow();
    expect(calls).toBe(3); // initial + 2 retries
  });
});
