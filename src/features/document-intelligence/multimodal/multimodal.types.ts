export interface ProviderHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'disabled';
  message?: string;
}

export interface ImageInput {
  mimeType: string;
  data: Buffer;
}

export interface OCRResult {
  text: string;
  confidence: number;
  provider: string;
}

export interface ExtractedTableDTO {
  pageNumber: number;
  tableIndex: number;
  title?: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  markdownRepresentation: string;
  extractionConfidence: number;
  extractionProvider: string;
}

export interface VisionAnalysisResult {
  description: string;
  confidence: number;
  entities: string[];
  provider: string;
}

export interface ChartDataPoint {
  label: string;
  value: string;
  confidence: number;
}

export interface ChartAnalysisResult {
  chartType?: string;
  description: string;
  dataPoints: ChartDataPoint[];
  confidence: number;
  provider: string;
}
