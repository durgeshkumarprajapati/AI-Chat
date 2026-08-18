import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildRelationshipExtractionPrompt } from '../prompts/relationship-extraction.prompt';
import { extractionValidatorService } from './extraction-validator.service';
import { ExtractedRelationshipDTO } from '../knowledge-graph.types';

export class RelationshipExtractorService {
  public async extractRelationships(
    chunkText: string,
    entityNames: string[],
    userId: string
  ): Promise<ExtractedRelationshipDTO[]> {
    if (!chunkText || entityNames.length < 2) {
      return [];
    }

    const prompt = buildRelationshipExtractionPrompt(chunkText, entityNames);

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
        const match = response.text.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        }
      }

      const validated = extractionValidatorService.sanitizeAndValidate(parsed);
      return validated.relationships;
    } catch (err) {
      console.warn('[RelationshipExtractorService] Extraction failed:', err);
      return [];
    }
  }
}

export const relationshipExtractorService = new RelationshipExtractorService();
