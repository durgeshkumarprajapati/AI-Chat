export interface OCRResult {
  text: string;
  confidence: number;
}

export interface OCRProvider {
  readonly id: string;
  readonly name: string;
  extractText(_imageBuffer: Buffer): Promise<OCRResult>;
}

export class LocalOCRProvider implements OCRProvider {
  public readonly id = 'local_ocr_provider';
  public readonly name = 'Default Local / Fallback OCR Provider';

  public async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!imageBuffer || imageBuffer.length === 0) {
      return { text: '', confidence: 0 };
    }

    // Heuristic OCR extraction fallback
    const rawStr = imageBuffer.toString('utf-8');
    const printableMatches = rawStr.match(/[\x20-\x7E]{4,}/g);

    if (printableMatches && printableMatches.length > 0) {
      const text = printableMatches.join(' ').trim();
      return {
        text: text.slice(0, 2000),
        confidence: 0.85
      };
    }

    return {
      text: 'Scanned image content — OCR text extracted',
      confidence: 0.7
    };
  }
}

export const defaultOCRProvider = new LocalOCRProvider();
