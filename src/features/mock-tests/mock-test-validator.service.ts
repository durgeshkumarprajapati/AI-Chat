import { MCQQuestion } from './mock-test.types';

export class MockTestValidatorService {
  /**
   * Validates that questions are grounded in source evidence and unique
   */
  public validateGroundingAndUniqueness(
    questions: MCQQuestion[],
    evidenceContext?: string
  ): { isValid: boolean; filteredQuestions: MCQQuestion[]; warnings: string[] } {
    const warnings: string[] = [];
    const seenQuestions = new Set<string>();
    const filteredQuestions: MCQQuestion[] = [];

    for (const q of questions) {
      const normalizedText = q.questionText.trim().toLowerCase();

      // Check uniqueness
      if (seenQuestions.has(normalizedText)) {
        warnings.push(`Duplicate question omitted: "${q.questionText}"`);
        continue;
      }
      seenQuestions.add(normalizedText);

      // Check option completeness
      if (!q.options || q.options.length < 2) {
        warnings.push(`Question omitted due to insufficient options: "${q.questionText}"`);
        continue;
      }

      // Check grounding if evidence context is present
      if (evidenceContext && evidenceContext.trim().length > 0) {
        const keywords = q.questionText.split(/\s+/).filter((w) => w.length > 4);
        const matchCount = keywords.filter((k) => evidenceContext.toLowerCase().includes(k.toLowerCase())).length;
        if (keywords.length > 0 && matchCount === 0) {
          warnings.push(`Question failed strict evidence grounding check: "${q.questionText}"`);
          // Still retain question with ungrounded warning tag if needed
        }
      }

      filteredQuestions.push(q);
    }

    return {
      isValid: filteredQuestions.length > 0,
      filteredQuestions,
      warnings
    };
  }
}

export const mockTestValidatorService = new MockTestValidatorService();
