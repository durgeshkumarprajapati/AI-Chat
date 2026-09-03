import type { PdfExtractionProvider } from './pdf-extraction-provider.js';
import type { ParsedDocument } from './pdf.parser.js';

interface PyMuPDFOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retryAttempts?: number;
}

/**
 * Optional provider — calls the separate FastAPI + PyMuPDF service (services/pdf-service/).
 * Never used unless PDF_EXTRACTION_PROVIDER=pymupdf is explicitly set. Sends the raw PDF bytes
 * directly (multipart) rather than a storage-key reference: the Node worker already downloads
 * the file from the existing storage abstraction (local/S3) before this provider is invoked, and
 * giving the Python service its own copy of storage credentials/config would duplicate the
 * storage abstraction into a second language for no real benefit — this is the "least invasive
 * compatible approach" the storage architecture actually supports.
 */
export class PyMuPDFExtractionProvider implements PdfExtractionProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;

  constructor(options?: PyMuPDFOptions) {
    this.baseUrl = (options?.baseUrl ?? process.env.PDF_SERVICE_URL ?? '').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? Number(process.env.PDF_SERVICE_TIMEOUT_MS || '30000');
    this.retryAttempts = options?.retryAttempts ?? Number(process.env.PDF_SERVICE_RETRY_ATTEMPTS || '2');
  }

  public async extract(buffer: Buffer, documentId: string): Promise<ParsedDocument> {
    if (!this.baseUrl) {
      throw new Error(
        'PDF_EXTRACTION_PROVIDER=pymupdf requires PDF_SERVICE_URL to be configured. Set PDF_EXTRACTION_PROVIDER=pdfjs to use the built-in extractor instead.'
      );
    }

    let lastError: unknown;
    const totalAttempts = Math.max(1, this.retryAttempts + 1);

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        return await this.requestExtraction(buffer, documentId);
      } catch (err) {
        lastError = err;
        if (attempt >= totalAttempts || !this.isRetryable(err)) break;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async requestExtraction(buffer: Buffer, documentId: string): Promise<ParsedDocument> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const form = new FormData();
      form.append('documentId', documentId);
      form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), `${documentId}.pdf`);

      const res = await fetch(`${this.baseUrl}/v1/extract`, {
        method: 'POST',
        body: form,
        signal: controller.signal
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const message =
          res.status === 422
            ? 'No extractable text found in PDF document. Image-only or scanned PDFs require OCR processing.'
            : `PDF service returned HTTP ${res.status}: ${bodyText.slice(0, 300)}`;
        const err = new Error(message) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const data = (await res.json()) as {
        totalPages?: number;
        pages?: Array<{ pageNumber: number; text: string }>;
      };

      if (!data || !Array.isArray(data.pages)) {
        throw new Error('PDF service returned a malformed extraction response (missing pages array).');
      }

      return {
        pageCount: data.totalPages ?? data.pages.length,
        pages: data.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text || '' }))
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private isRetryable(err: unknown): boolean {
    const status = (err as { status?: number } | undefined)?.status;
    // Client-side errors (invalid/corrupted PDF, no extractable text) are never retryable.
    if (status && status >= 400 && status < 500) return false;
    if (status && status >= 500) return true;

    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('AbortError') ||
      msg.includes('fetch failed')
    );
  }
}

export const pyMuPDFExtractionProvider = new PyMuPDFExtractionProvider();
