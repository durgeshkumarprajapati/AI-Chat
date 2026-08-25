import { llmGateway } from '@/features/llm/llm-gateway.service';
import { VisionProvider } from './vision-provider.interface';
import { buildImageAnalysisPrompt, buildChartAnalysisPrompt } from './vision-prompt';
import { ImageInput, VisionAnalysisResult, ChartAnalysisResult, ChartDataPoint } from '../multimodal.types';

const UNAVAILABLE_IMAGE_RESULT: VisionAnalysisResult = { description: '', confidence: 0, entities: [], provider: 'gemini' };
const UNAVAILABLE_CHART_RESULT: ChartAnalysisResult = { description: '', dataPoints: [], confidence: 0, provider: 'gemini' };
const MAX_ENTITIES = 20;
const MAX_DATA_POINTS = 50;

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return undefined;
  }
}

function sanitizeEntities(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is string => typeof e === 'string' && e.trim().length > 0).slice(0, MAX_ENTITIES);
}

function sanitizeConfidence(raw: any): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5;
}

function sanitizeDataPoints(raw: any): ChartDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
    .slice(0, MAX_DATA_POINTS)
    .map((p) => ({
      label: typeof p.label === 'string' ? p.label.slice(0, 100) : '',
      value: typeof p.value === 'string' ? p.value.slice(0, 100) : '',
      confidence: sanitizeConfidence(p.confidence)
    }))
    .filter((p) => p.label && p.value);
}

/**
 * REAL provider — calls the existing Gemini LLM Gateway (additively extended with an `images`
 * field, see llm.types.ts) with an actual image buffer. Any failure — including a fallback
 * provider throwing on `images` if Gemini itself is unavailable — is caught here and converted to
 * an "unavailable" result; it never propagates and never blocks the caller.
 */
export class GeminiVisionProvider implements VisionProvider {
  public readonly name = 'gemini';

  public async analyzeImage(image: ImageInput): Promise<VisionAnalysisResult> {
    try {
      const response = await llmGateway.generate({
        prompt: buildImageAnalysisPrompt(),
        images: [{ mimeType: image.mimeType, data: image.data.toString('base64') }],
        providerOverride: 'gemini',
        feature: 'MULTIMODAL'
      });

      const parsed = parseJson(response.text);
      if (!parsed) return UNAVAILABLE_IMAGE_RESULT;

      return {
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 2000) : '',
        confidence: sanitizeConfidence(parsed.confidence),
        entities: sanitizeEntities(parsed.entities),
        provider: this.name
      };
    } catch (err) {
      console.warn('[GeminiVisionProvider] Image analysis unavailable:', err);
      return UNAVAILABLE_IMAGE_RESULT;
    }
  }

  public async analyzeChart(image: ImageInput): Promise<ChartAnalysisResult> {
    try {
      const response = await llmGateway.generate({
        prompt: buildChartAnalysisPrompt(),
        images: [{ mimeType: image.mimeType, data: image.data.toString('base64') }],
        providerOverride: 'gemini',
        feature: 'MULTIMODAL'
      });

      const parsed = parseJson(response.text);
      if (!parsed) return UNAVAILABLE_CHART_RESULT;

      return {
        chartType: typeof parsed.chartType === 'string' ? parsed.chartType.slice(0, 50) : undefined,
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 2000) : '',
        dataPoints: sanitizeDataPoints(parsed.dataPoints),
        confidence: sanitizeConfidence(parsed.confidence),
        provider: this.name
      };
    } catch (err) {
      console.warn('[GeminiVisionProvider] Chart analysis unavailable:', err);
      return UNAVAILABLE_CHART_RESULT;
    }
  }

  public async extractDescription(image: ImageInput): Promise<string> {
    const result = await this.analyzeImage(image);
    return result.description;
  }

  public async extractEntities(image: ImageInput): Promise<string[]> {
    const result = await this.analyzeImage(image);
    return result.entities;
  }

  public supports(): boolean {
    return true;
  }
}

export const geminiVisionProvider = new GeminiVisionProvider();
