import { OCRProvider } from './ocr-provider.interface';
import { ImageInput, OCRResult, ProviderHealthStatus } from '../multimodal.types';

/**
 * Deterministic, clearly-labeled placeholder — the safe default (DOCUMENT_OCR_PROVIDER=mock).
 * Never throws, never claims a confident result, and never pretends to have read pixel content.
 */
export class MockOCRProvider implements OCRProvider {
  public readonly name = 'mock';

  public async healthCheck(): Promise<ProviderHealthStatus> {
    return { name: this.name, status: 'healthy', message: 'Mock OCR provider — no real OCR performed.' };
  }

  public async extractText(_image: ImageInput): Promise<OCRResult> {
    return { text: '', confidence: 0, provider: this.name };
  }

  public async extractPage(images: ImageInput[]): Promise<OCRResult[]> {
    return images.map(() => ({ text: '', confidence: 0, provider: this.name }));
  }

  public supports(): boolean {
    return true;
  }
}

export const mockOCRProvider = new MockOCRProvider();
