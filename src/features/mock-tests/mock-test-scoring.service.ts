import { MCQQuestion, AnswerSubmissionItem } from './mock-test.types';

export interface ScoreEvaluationResult {
  totalQuestions: number;
  correctCount: number;
  scorePercentage: number;
  passed: boolean;
  itemizedResults: Array<{
    questionId: string;
    isCorrect: boolean;
    userSelectedOptionIds: string[];
    correctOptionIds: string[];
    explanation: string;
  }>;
}

export class MockTestScoringService {
  /**
   * Evaluates user answer submissions against server-authoritative correct options
   */
  public evaluateTest(
    questions: MCQQuestion[],
    userSubmissions: AnswerSubmissionItem[],
    passingScorePercentage = 70.0
  ): ScoreEvaluationResult {
    let correctCount = 0;
    const itemizedResults: ScoreEvaluationResult['itemizedResults'] = [];

    for (const q of questions) {
      const submission = userSubmissions.find((s) => s.questionId === q.id);
      const userSelected = submission ? submission.selectedOptionIds || [] : [];

      const correctOptionIds = q.options
        ? q.options.filter((o) => o.isCorrect).map((o) => o.id)
        : q.correctOptionId
        ? [q.correctOptionId]
        : [];

      let isCorrect = false;
      if (correctOptionIds.length > 0 && userSelected.length > 0) {
        const selectedSet = new Set(userSelected);
        const correctSet = new Set(correctOptionIds);

        if (selectedSet.size === correctSet.size) {
          isCorrect = Array.from(selectedSet).every((id) => correctSet.has(id));
        }
      }

      if (isCorrect) correctCount++;

      itemizedResults.push({
        questionId: q.id,
        isCorrect,
        userSelectedOptionIds: userSelected,
        correctOptionIds,
        explanation: q.explanation || 'No explanation provided.'
      });
    }

    const totalQuestions = questions.length || 1;
    const scorePercentage = Math.round((correctCount / totalQuestions) * 1000) / 10;
    const passed = scorePercentage >= passingScorePercentage;

    return {
      totalQuestions,
      correctCount,
      scorePercentage,
      passed,
      itemizedResults
    };
  }
}

export const mockTestScoringService = new MockTestScoringService();
