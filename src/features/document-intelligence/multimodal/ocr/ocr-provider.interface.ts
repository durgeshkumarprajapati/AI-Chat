import { ImageInput, OCRResult, ProviderHealthStatus } from '../multimodal.types';

export interface OCRProvider {
  readonly name: string;
  healthCheck(): Promise<ProviderHealthStatus>;
  extractText(_image: ImageInput): Promise<OCRResult>;
  extractPage(_images: ImageInput[]): Promise<OCRResult[]>;
  supports(): boolean;
}
