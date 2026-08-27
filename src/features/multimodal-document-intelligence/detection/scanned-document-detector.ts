export interface ScannedDetectionResult {
  isScanned: boolean;
  textCoverageRatio: number;
  averageCharsPerPage: number;
  scannedPageNumbers: number[];
}

export class ScannedDocumentDetector {
  /**
   * Evaluates text coverage per page to detect scanned or low-text PDF pages.
   */
  public detect(pages: Array<{ pageNumber: number; text: string }>): ScannedDetectionResult {
    if (pages.length === 0) {
      return { isScanned: true, textCoverageRatio: 0, averageCharsPerPage: 0, scannedPageNumbers: [] };
    }

    const scannedPageNumbers: number[] = [];
    let totalChars = 0;

    for (const page of pages) {
      const cleanText = page.text.replace(/\s+/g, ' ').trim();
      const charCount = cleanText.length;
      totalChars += charCount;

      if (charCount < 50) {
        scannedPageNumbers.push(page.pageNumber);
      }
    }

    const averageCharsPerPage = Math.round(totalChars / pages.length);
    const scannedRatio = scannedPageNumbers.length / pages.length;
    const isScanned = scannedRatio > 0.4 || averageCharsPerPage < 80;

    return {
      isScanned,
      textCoverageRatio: 1 - scannedRatio,
      averageCharsPerPage,
      scannedPageNumbers
    };
  }
}

export const scannedDocumentDetector = new ScannedDocumentDetector();
