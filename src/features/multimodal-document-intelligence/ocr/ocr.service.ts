import { OCRInput, OCRProvider, OCRResult } from './ocr-provider.interface';
import { fallbackOCRProvider } from './providers/fallback-ocr.provider';
import { getMultimodalConfig } from '../multimodal.config';

export class OCRService {
  private providers: OCRProvider[] = [fallbackOCRProvider];

  public registerProvider(provider: OCRProvider): void {
    this.providers.unshift(provider);
  }

  public async performOCR(input: OCRInput): Promise<OCRResult> {
    const config = getMultimodalConfig();
    const timeoutMs = config.ocrTimeoutMs;

    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) continue;

        const resultPromise = provider.extract(input);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`OCR timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        return await Promise.race([resultPromise, timeoutPromise]);
      } catch (err) {
        console.warn(`[OCRService] Provider ${provider.name} failed:`, err);
        // Continue to next provider in priority chain
      }
    }

    return fallbackOCRProvider.extract(input);
  }
}

export const ocrService = new OCRService();
