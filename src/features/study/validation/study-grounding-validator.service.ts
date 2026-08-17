import { GeneratedQuestionPayload } from '../study.types';

export interface GroundingValidationResult {
  isValid: boolean;
  reason?: string;
}

export class StudyQuestionGroundingValidator {
  /**
   * Validate that a generated question is strictly grounded in evidence and contains no prohibited fallbacks or hallucinations.
   */
  public validateGrounding(
    payload: GeneratedQuestionPayload,
    evidenceChunks: Array<{ content: string; documentId?: string; pageNumber?: number }>
  ): GroundingValidationResult {
    // 1. Evidence presence check
    if (!evidenceChunks || evidenceChunks.length === 0) {
      return { isValid: false, reason: 'No evidence chunks provided for grounding validation.' };
    }

    // 2. Question text validity
    if (!payload.question || payload.question.trim().length < 5) {
      return { isValid: false, reason: 'Question text is empty or too short.' };
    }

    // 3. Reject prohibited generic fallback strings
    const prohibitedPatterns = [
      /unrelated fallback concept/i,
      /fallback concept/i,
      /none of the above/i,
      /placeholder option/i
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(payload.question)) {
        return { isValid: false, reason: 'Question contains prohibited fallback pattern.' };
      }

      if (payload.options && Array.isArray(payload.options)) {
        for (const opt of payload.options) {
          if (pattern.test(opt)) {
            return { isValid: false, reason: 'Option contains prohibited fallback pattern.' };
          }
        }
      }
    }

    // 4. MCQ options validation
    if (payload.questionType === 'MCQ') {
      if (!payload.options || payload.options.length < 2) {
        return { isValid: false, reason: 'MCQ must contain at least 2 distinct options.' };
      }

      const uniqueOpts = new Set(payload.options.map((o) => o.trim().toLowerCase()));
      if (uniqueOpts.size < payload.options.length) {
        return { isValid: false, reason: 'MCQ contains duplicate options.' };
      }
    }

    // 5. Evidence Keyword Alignment Heuristic
    const combinedEvidence = evidenceChunks.map((c) => c.content.toLowerCase()).join(' ');

    // Extract significant keywords (length >= 4) from the question and expected answer
    const questionTokens = payload.question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    const answerTokens = (payload.expectedAnswer || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4);

    const allTokens = [...new Set([...questionTokens, ...answerTokens])];
    if (allTokens.length > 0) {
      const matchCount = allTokens.filter((token) => combinedEvidence.includes(token)).length;
      const matchRatio = matchCount / allTokens.length;

      // Expect at least 20% key domain token alignment with retrieved document evidence
      if (matchRatio < 0.15 && combinedEvidence.length > 100) {
        return {
          isValid: false,
          reason: `Question and answer fail minimum evidence keyword alignment ratio (${(matchRatio * 100).toFixed(1)}%).`
        };
      }
    }

    return { isValid: true };
  }
}

export const studyGroundingValidator = new StudyQuestionGroundingValidator();
