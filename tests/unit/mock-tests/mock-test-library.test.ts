import { mockTestSessionService } from '@/features/mock-tests/mock-test-session.service';
import { MCQQuestion } from '@/features/mock-tests/mock-test.types';

describe('Mock Test Library Answer Security Unit Tests', () => {
  test('strictly sanitizes questions by stripping correctOptionId, isCorrect, and explanations', () => {
    const rawQuestions: MCQQuestion[] = [
      {
        id: 'q1',
        questionText: 'What is React reconciliation?',
        type: 'MCQ_SINGLE',
        options: [
          { id: 'o1', optionText: 'Virtual DOM Diffing algorithm', isCorrect: true },
          { id: 'o2', optionText: 'Database indexing', isCorrect: false },
          { id: 'o3', optionText: 'Network protocol', isCorrect: false }
        ],
        correctOptionId: 'o1',
        explanation: 'Reconciliation is the process through which React updates the DOM.'
      }
    ];

    const sanitized = mockTestSessionService.sanitizeQuestionsForClient(rawQuestions);

    expect(sanitized.length).toBe(1);
    expect(sanitized[0]?.id).toBe('q1');
    expect((sanitized[0] as any).correctOptionId).toBeUndefined();
    expect((sanitized[0] as any).explanation).toBeUndefined();

    const option1 = sanitized[0]?.options[0];
    expect(option1?.id).toBe('o1');
    expect(option1?.optionText).toBe('Virtual DOM Diffing algorithm');
    expect((option1 as any).isCorrect).toBeUndefined();
  });
});
