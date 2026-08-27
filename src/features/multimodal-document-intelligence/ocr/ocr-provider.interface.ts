export interface OCRInput {
  buffer?: Buffer;
  imagePath?: string;
  pageNumber?: number;
  mimeType?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  providerName: string;
  blocks?: Array<{ text: string; confidence: number; bbox?: number[] }>;
}

export interface OCRProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  extract(_input: OCRInput): Promise<OCRResult>;
}
