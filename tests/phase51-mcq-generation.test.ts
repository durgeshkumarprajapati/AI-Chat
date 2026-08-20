import { mockTestGeneratorService } from '@/features/mock-tests/mock-test-generator.service';
import { mockTestSessionService } from '@/features/mock-tests/mock-test-session.service';
import { MockTestGeneratedQuestionSchema, MCQQuestion } from '@/features/mock-tests/mock-test.types';
import { envConfig } from '@/config/env';

describe('Phase 51 — Production AI MCQ Generation, RAG Grounding & Config Integration Tests', () => {
  test('1. Centralized Environment Configuration (src/config/env.ts) validates properties', () => {
    expect(envConfig.mockTests).toBeDefined();
    expect(envConfig.mockTests.defaultQuestionCount).toBeGreaterThan(0);
    expect(envConfig.mockTests.maxGenerationAttempts).toBeGreaterThan(0);
    expect(envConfig.mockTests.similarityThreshold).toBeGreaterThan(0);
    expect(envConfig.webrtc.stunServers.length).toBeGreaterThan(0);
  });

  test('2. Zod Schema validates valid question and rejects malformed items', () => {
    const validQ = {
      questionText: 'What is the runtime complexity of binary search?',
      type: 'MCQ_SINGLE',
      options: [
        { id: 'A', optionText: 'O(log n)', isCorrect: true },
        { id: 'B', optionText: 'O(n)', isCorrect: false },
        { id: 'C', optionText: 'O(n^2)', isCorrect: false },
        { id: 'D', optionText: 'O(1)', isCorrect: false }
      ],
      correctOptionId: 'A',
      explanation: 'Binary search divides search space in half at each step.',
      difficulty: 'MEDIUM',
      evidenceIds: ['doc_1']
    };

    const parsed = MockTestGeneratedQuestionSchema.safeParse(validQ);
    expect(parsed.success).toBe(true);

    // Reject empty question text
    const emptyQ = { ...validQ, questionText: '   ' };
    expect(MockTestGeneratedQuestionSchema.safeParse(emptyQ).success).toBe(false);

    // Reject duplicate option texts
    const dupOptQ = {
      ...validQ,
      options: [
        { id: 'A', optionText: 'O(n)', isCorrect: true },
        { id: 'B', optionText: 'O(n)', isCorrect: false },
        { id: 'C', optionText: 'O(n^2)', isCorrect: false },
        { id: 'D', optionText: 'O(1)', isCorrect: false }
      ]
    };
    expect(MockTestGeneratedQuestionSchema.safeParse(dupOptQ).success).toBe(false);

    // Reject invalid correctOptionId
    const invalidAnsQ = { ...validQ, correctOptionId: 'Z' };
    expect(MockTestGeneratedQuestionSchema.safeParse(invalidAnsQ).success).toBe(false);
  });

  test('3. Exact and Semantic Duplicate Detection', () => {
    const q1 = 'What is the primary purpose of React useEffect hook?';
    const q2 = 'What is the primary purpose of React useEffect hook?';
    const q3 = 'Why do we use the useEffect hook in React?';
    const q4 = 'How does PostgreSQL B-tree indexing function?';

    const hash1 = mockTestGeneratorService.generateQuestionHash(q1);
    const hash2 = mockTestGeneratorService.generateQuestionHash(q2);
    expect(hash1).toBe(hash2);

    expect(mockTestGeneratorService.isSemanticDuplicate(q1, q3, 0.5)).toBe(true);
    expect(mockTestGeneratorService.isSemanticDuplicate(q1, q4, 0.85)).toBe(false);
  });

  test('4. Question Normalizer converts legacy string options and object options into canonical MCQQuestion', () => {
    const legacyRaw = {
      id: 'leg_1',
      question: 'What is Node.js event loop?',
      options: ['Single-threaded event loop', 'Multi-threaded kernel', 'Database driver', 'CSS processor'],
      correctOptionIndex: 0,
      explanation: 'Node.js handles async I/O via single thread event loop.'
    };

    const normalized = mockTestSessionService.normalizeQuestion(legacyRaw, 0);
    expect(normalized.questionText).toBe('What is Node.js event loop?');
    expect(normalized.options.length).toBe(4);
    expect(normalized.options[0]?.id).toBe('A');
    expect(normalized.options[0]?.optionText).toBe('Single-threaded event loop');
    expect(normalized.correctOptionId).toBe('A');
  });

  test('5. Active Test Answer Security sanitizes questions cleanly', () => {
    const rawQuestions: MCQQuestion[] = [
      {
        id: 'q_sec_1',
        questionText: 'What is Docker image layering?',
        type: 'MCQ_SINGLE',
        options: [
          { id: 'A', optionText: 'Read-only filesystem layers', isCorrect: true },
          { id: 'B', optionText: 'Virtual Machine RAM', isCorrect: false },
          { id: 'C', optionText: 'Kubernetes ingress', isCorrect: false },
          { id: 'D', optionText: 'Network socket', isCorrect: false }
        ],
        correctOptionId: 'A',
        explanation: 'Docker images consist of stacked read-only layers.',
        difficulty: 'MEDIUM'
      }
    ];

    const sanitized = mockTestSessionService.sanitizeQuestionsForClient(rawQuestions);
    expect(sanitized.length).toBe(1);
    expect(sanitized[0]?.id).toBe('q_sec_1');
    expect(sanitized[0]?.questionText).toBe('What is Docker image layering?');
    expect((sanitized[0] as any).correctOptionId).toBeUndefined();
    expect((sanitized[0] as any).explanation).toBeUndefined();
    expect((sanitized[0]?.options[0] as any).isCorrect).toBeUndefined();
  });

  test('6. MockTestGenerator generates grounded questions set', async () => {
    const questions = await mockTestGeneratorService.generateQuestions({
      topic: 'Distributed Systems',
      questionCount: 5,
      difficulty: 'MEDIUM'
    });

    expect(questions.length).toBe(5);
    for (const q of questions) {
      expect(q.questionText.length).toBeGreaterThan(0);
      expect(q.options.length).toBe(4);
      expect(q.correctOptionId).toBeDefined();
      expect(q.explanation.length).toBeGreaterThan(0);
    }
  });
});
