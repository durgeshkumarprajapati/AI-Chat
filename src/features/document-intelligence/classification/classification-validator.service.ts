import { CONTROLLED_DOCUMENT_TYPES, ClassificationResultDTO, DocumentTypeValue } from '../document-intelligence.types';

const CONTROLLED_SET: readonly string[] = CONTROLLED_DOCUMENT_TYPES;

// Clamps the LLM's returned type string to the DocumentType enum's actual members (else 'OTHER')
// and confidence to [0,1] — mirrors extraction-validator.service.ts's controlled-type clamp.
export class ClassificationValidatorService {
  public sanitizeAndValidate(raw: any): ClassificationResultDTO {
    if (!raw || typeof raw !== 'object') {
      return { documentType: 'OTHER', confidence: 0 };
    }

    let documentType: DocumentTypeValue = 'OTHER';
    if (typeof raw.documentType === 'string') {
      const upper = raw.documentType.toUpperCase().trim();
      if (CONTROLLED_SET.includes(upper)) {
        documentType = upper as DocumentTypeValue;
      }
    }

    const confidence =
      typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;

    return { documentType, confidence };
  }
}

export const classificationValidatorService = new ClassificationValidatorService();
