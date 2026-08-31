export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type ParsedDocument = {
  pageCount: number;
  pages: ExtractedPage[];
};

export interface DocumentParser {
  parse(buffer: Buffer): Promise<ParsedDocument>;
}

export function cleanExtractedText(text: string): string {
  if (!text) return '';

  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class WorkerPdfParser implements DocumentParser {
  public async parse(buffer: Buffer): Promise<ParsedDocument> {
    if (!buffer || buffer.length === 0) {
      throw new Error('Cannot parse empty or invalid PDF buffer.');
    }

    // Fallback: If uploaded file is plain text (does not start with %PDF header), extract text directly
    const firstBytes = buffer.subarray(0, 8).toString('utf8');
    if (!firstBytes.startsWith('%PDF')) {
      const utf8Text = cleanExtractedText(buffer.toString('utf8'));
      if (utf8Text.length > 0) {
        return {
          pageCount: 1,
          pages: [{ pageNumber: 1, text: utf8Text }]
        };
      }
    }

    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = Uint8Array.from(buffer);
      const loadingTask = pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        isEvalSupported: false
      });

      const pdfDocument = await loadingTask.promise;
      const pageCount = pdfDocument.numPages;

      if (!pageCount || pageCount === 0) {
        throw new Error('PDF document has zero pages.');
      }

      const pages: ExtractedPage[] = [];
      let totalExtractedLength = 0;

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        const rawText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');

        const cleanedText = cleanExtractedText(rawText);
        totalExtractedLength += cleanedText.length;

        pages.push({
          pageNumber: pageNum,
          text: cleanedText
        });
      }

      if (totalExtractedLength === 0) {
        throw new Error('No extractable text found in PDF document. Image-only or scanned PDFs require OCR processing.');
      }

      return {
        pageCount,
        pages
      };
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (rawMsg.includes('No extractable text found') || rawMsg.includes('Cannot parse empty')) {
        throw error;
      }
      console.error('[WorkerPdfParser] Raw parsing error:', rawMsg);
      throw new Error(`Unable to extract text from PDF document: ${rawMsg.includes('Invalid PDF') ? 'Invalid or corrupted PDF format.' : rawMsg}`);
    }
  }
}

export const workerPdfParser = new WorkerPdfParser();
