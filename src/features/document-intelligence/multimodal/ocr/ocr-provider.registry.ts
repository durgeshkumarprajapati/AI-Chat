import { OCRProvider } from './ocr-provider.interface';
import { mockOCRProvider } from './mock-ocr.provider';
import { sarvamOCRProvider } from './sarvam-ocr.provider';

export class OCRProviderRegistry {
  private providers = new Map<string, OCRProvider>([
    ['mock', mockOCRProvider],
    ['sarvam', sarvamOCRProvider]
  ]);

  public register(provider: OCRProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): OCRProvider {
    return this.providers.get(name) ?? mockOCRProvider;
  }
}

export const ocrProviderRegistry = new OCRProviderRegistry();
