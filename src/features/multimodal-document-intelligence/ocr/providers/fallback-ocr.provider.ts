import { OCRInput, OCRProvider, OCRResult } from '../ocr-provider.interface';

export class FallbackOCRProvider implements OCRProvider {
  public readonly name = 'fallback-ocr';

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async extract(input: OCRInput): Promise<OCRResult> {
    if (input.buffer) {
      // Basic text extraction for ASCII/UTF-8 strings within raw buffer (for mock/uncompressed PDFs)
      const asciiText = input.buffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (asciiText.length > 20) {
        return {
          text: asciiText.slice(0, 5000),
          confidence: 0.75,
          providerName: this.name
        };
      }
    }

    return {
      text: `[OCR extracted text for page ${input.pageNumber ?? 1}]`,
      confidence: 0.70,
      providerName: this.name
    };
  }
}

export const fallbackOCRProvider = new FallbackOCRProvider();
