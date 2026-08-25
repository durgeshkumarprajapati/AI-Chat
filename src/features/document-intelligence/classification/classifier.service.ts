import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildClassificationPrompt } from './classification.prompt';
import { classificationValidatorService } from './classification-validator.service';
import { ClassificationResultDTO } from '../document-intelligence.types';

export class ClassifierService {
  public async classify(documentText: string, userId: string): Promise<ClassificationResultDTO> {
    if (!documentText || documentText.trim().length === 0) {
      return { documentType: 'OTHER', confidence: 0 };
    }

    const prompt = buildClassificationPrompt(documentText);

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

      return classificationValidatorService.sanitizeAndValidate(parsed);
    } catch (err) {
      console.warn('[ClassifierService] Classification failed:', err);
      return { documentType: 'OTHER', confidence: 0 };
    }
  }
}

export const classifierService = new ClassifierService();
