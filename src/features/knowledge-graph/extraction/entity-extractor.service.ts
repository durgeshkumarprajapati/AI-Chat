import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildEntityExtractionPrompt } from '../prompts/entity-extraction.prompt';
import { extractionValidatorService } from './extraction-validator.service';
import { ExtractedEntityDTO } from '../knowledge-graph.types';

export class EntityExtractorService {
  public async extractEntities(chunkText: string, userId: string): Promise<ExtractedEntityDTO[]> {
    if (!chunkText || chunkText.trim().length === 0) {
      return [];
    }

    const prompt = buildEntityExtractionPrompt(chunkText);

    try {
      const response = await llmGateway.generate({
        prompt,
        feature: 'GENERAL',
        userId
      });

      let parsed: any;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        // Fallback regex attempt for JSON block inside markdown
        const match = response.text.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        }
      }

      const validated = extractionValidatorService.sanitizeAndValidate(parsed);
      return validated.entities;
    } catch (err) {
      console.warn('[EntityExtractorService] Extraction failed:', err);
      return [];
    }
  }
}

export const entityExtractorService = new EntityExtractorService();
