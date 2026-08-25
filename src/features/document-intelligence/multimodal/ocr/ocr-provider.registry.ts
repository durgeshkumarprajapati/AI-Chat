import { OCRProvider } from './ocr-provider.interface';
import { mockOCRProvider } from './mock-ocr.provider';

/**
 * Simple config-selected provider registry — no cross-provider fallback chain needed here (unlike
 * the LLM Gateway). Only 'mock' has a real implementation this pass; other configured names fall
 * back to mock automatically rather than throwing, since OCR failures must never block ingestion.
 */
export class OCRProviderRegistry {
  private providers = new Map<string, OCRProvider>([['mock', mockOCRProvider]]);

  public register(provider: OCRProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): OCRProvider {
    return this.providers.get(name) ?? mockOCRProvider;
  }
}

export const ocrProviderRegistry = new OCRProviderRegistry();
