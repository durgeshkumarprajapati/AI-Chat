import { workerPdfParser } from './pdf.parser.js';
import type { PdfExtractionProvider } from './pdf-extraction-provider.js';
import type { ParsedDocument } from './pdf.parser.js';

/** Default provider — delegates to the existing, unmodified WorkerPdfParser. */
export class PdfJsExtractionProvider implements PdfExtractionProvider {
  public async extract(buffer: Buffer, _documentId: string): Promise<ParsedDocument> {
    return workerPdfParser.parse(buffer);
  }
}

export const pdfJsExtractionProvider = new PdfJsExtractionProvider();
