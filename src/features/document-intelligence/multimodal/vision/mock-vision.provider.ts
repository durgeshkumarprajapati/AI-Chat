import { VisionProvider } from './vision-provider.interface';
import { ImageInput, VisionAnalysisResult, ChartAnalysisResult } from '../multimodal.types';

/**
 * Deterministic, clearly-labeled placeholder — the safe default (DOCUMENT_VISION_PROVIDER=mock).
 * Never inspects pixel content, never claims a confident result.
 */
export class MockVisionProvider implements VisionProvider {
  public readonly name = 'mock';

  public async analyzeImage(_image: ImageInput): Promise<VisionAnalysisResult> {
    return { description: '', confidence: 0, entities: [], provider: this.name };
  }

  public async analyzeChart(_image: ImageInput): Promise<ChartAnalysisResult> {
    return { description: '', dataPoints: [], confidence: 0, provider: this.name };
  }

  public async extractDescription(_image: ImageInput): Promise<string> {
    return '';
  }

  public async extractEntities(_image: ImageInput): Promise<string[]> {
    return [];
  }

  public supports(): boolean {
    return true;
  }
}

export const mockVisionProvider = new MockVisionProvider();
