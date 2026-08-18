import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildClaimExtractionPrompt } from '../prompts/claim-extraction.prompt';
import { extractionValidatorService } from './extraction-validator.service';
import { ExtractedClaimDTO } from '../knowledge-graph.types';

export class ClaimExtractorService {
  public async extractClaims(chunkText: string, userId: string): Promise<ExtractedClaimDTO[]> {
    if (!chunkText || chunkText.trim().length === 0) {
      return [];
    }

    const prompt = buildClaimExtractionPrompt(chunkText);

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
      return validated.claims;
    } catch (err) {
      console.warn('[ClaimExtractorService] Extraction failed:', err);
      return [];
    }
  }
}

export const claimExtractorService = new ClaimExtractorService();
