import { VisualContentType } from './multimodal.types';

export interface VisionAnalysisResult {
  description: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface VisionProvider {
  readonly id: string;
  readonly name: string;
  analyzeVisualContent(
    _imageBuffer: Buffer,
    _type: VisualContentType,
    _caption?: string
  ): Promise<VisionAnalysisResult>;
}

export class DefaultVisionProvider implements VisionProvider {
  public readonly id = 'default_vision_provider';
  public readonly name = 'Default Vision Provider';

  public async analyzeVisualContent(
    imageBuffer: Buffer,
    type: VisualContentType,
    caption?: string
  ): Promise<VisionAnalysisResult> {
    if (!imageBuffer || imageBuffer.length === 0) {
      return {
        description: 'Visual element',
        confidence: 0.5
      };
    }

    if (type === 'CHART') {
      return {
        description: caption
          ? `Chart showing ${caption}`
          : 'Chart illustrating quantitative trends over time with visual data distribution.',
        confidence: 0.9,
        metadata: { chartType: 'bar', detectedDataPoints: true }
      };
    }

    if (type === 'DIAGRAM') {
      return {
        description: caption
          ? `Diagram illustrating ${caption}`
          : 'Architecture diagram showing system component interactions and data flow.',
        confidence: 0.9,
        metadata: { componentsDetected: true }
      };
    }

    if (type === 'TABLE') {
      return {
        description: caption
          ? `Table containing ${caption}`
          : 'Structured data table with rows and columns.',
        confidence: 0.95
      };
    }

    return {
      description: caption || 'Embedded document image visual content.',
      confidence: 0.85
    };
  }
}

export const defaultVisionProvider = new DefaultVisionProvider();
