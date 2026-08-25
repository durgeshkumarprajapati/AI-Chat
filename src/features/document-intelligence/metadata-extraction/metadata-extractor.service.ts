import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildMetadataExtractionPrompt } from './metadata-extraction.prompt';
import { metadataValidatorService } from './metadata-validator.service';
import { ExtractedDocumentMetadataDTO } from '../document-intelligence.types';

export class MetadataExtractorService {
  public async extractMetadata(documentText: string, userId: string): Promise<ExtractedDocumentMetadataDTO> {
    if (!documentText || documentText.trim().length === 0) {
      return {};
    }

    const prompt = buildMetadataExtractionPrompt(documentText);

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

      return metadataValidatorService.sanitizeAndValidate(parsed);
    } catch (err) {
      console.warn('[MetadataExtractorService] Extraction failed:', err);
      return {};
    }
  }
}

export const metadataExtractorService = new MetadataExtractorService();
