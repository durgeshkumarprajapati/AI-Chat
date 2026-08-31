import { OCRProvider } from './ocr-provider.interface';
import { ImageInput, OCRResult, ProviderHealthStatus } from '../multimodal.types';
import { sarvamClient } from '@/features/sarvam/sarvam.client';
import { sarvamConfigService } from '@/features/sarvam/sarvam.config';

export class SarvamOCRProvider implements OCRProvider {
  public readonly name = 'sarvam';

  public async healthCheck(): Promise<ProviderHealthStatus> {
    const isConfigured = sarvamClient.isConfigured();
    const config = await sarvamConfigService.getConfig();

    if (isConfigured && config.enabled && config.digitisationEnabled) {
      return { name: this.name, status: 'healthy', message: 'Sarvam AI Document Intelligence OCR active.' };
    }

    return { name: this.name, status: 'disabled', message: 'Sarvam OCR disabled or API key missing.' };
  }

  public async extractText(image: ImageInput): Promise<OCRResult> {
    const isConfigured = sarvamClient.isConfigured();
    const config = await sarvamConfigService.getConfig();

    if (!isConfigured || !config.enabled || !config.digitisationEnabled) {
      return { text: '', confidence: 0, provider: this.name };
    }

    try {
      const base64Content = image.data ? image.data.toString('base64') : '';
      if (!base64Content) {
        return { text: '', confidence: 0, provider: this.name };
      }

      const res = await sarvamClient.startDigitisation(base64Content, config.timeoutMs);
      const text = res.result?.pages?.map((p) => p.text || '').join('\n') || '';

      return {
        text,
        confidence: text ? 0.92 : 0,
        provider: this.name
      };
    } catch {
      return { text: '', confidence: 0, provider: this.name };
    }
  }

  public async extractPage(images: ImageInput[]): Promise<OCRResult[]> {
    return Promise.all(images.map((img) => this.extractText(img)));
  }

  public supports(): boolean {
    return sarvamClient.isConfigured();
  }
}

export const sarvamOCRProvider = new SarvamOCRProvider();
