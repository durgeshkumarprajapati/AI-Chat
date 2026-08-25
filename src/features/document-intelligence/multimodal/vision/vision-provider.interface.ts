import { ImageInput, VisionAnalysisResult, ChartAnalysisResult } from '../multimodal.types';

export interface VisionProvider {
  readonly name: string;
  analyzeImage(_image: ImageInput): Promise<VisionAnalysisResult>;
  analyzeChart(_image: ImageInput): Promise<ChartAnalysisResult>;
  extractDescription(_image: ImageInput): Promise<string>;
  extractEntities(_image: ImageInput): Promise<string[]>;
  supports(): boolean;
}
