import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';
import { prisma } from '@/lib/prisma';
import { MockTestStatus } from '@prisma/client';

describe('Mock Test Library Security & Answer Protection Tests', () => {
  let testUser: any;
  let otherUser: any;
  let scheduledTest: any;

  beforeAll(async () => {
    testUser = await prisma.user.upsert({
      where: { email: 'creator_sec@example.com' },
      create: { email: 'creator_sec@example.com', name: 'Creator User', passwordHash: 'hash' },
      update: {}
    });

    otherUser = await prisma.user.upsert({
      where: { email: 'student_sec@example.com' },
      create: { email: 'student_sec@example.com', name: 'Student User', passwordHash: 'hash' },
      update: {}
    });

    scheduledTest = await prisma.scheduledMockTest.create({
      data: {
        createdById: testUser.id,
        title: 'Security Active Exam',
        scheduledStartTime: new Date(Date.now() + 3600 * 1000),
        status: MockTestStatus.SCHEDULED,
        questions: [
          {
            id: 'q_sec_1',
            questionText: 'What is AES-256?',
            type: 'MCQ_SINGLE',
            options: [
              { id: 'opt_1', optionText: 'Symmetric Encryption Standard', isCorrect: true },
              { id: 'opt_2', optionText: 'Hash function', isCorrect: false }
            ],
            correctOptionId: 'opt_1',
            explanation: 'AES-256 is a symmetric block cipher.'
          }
        ] as any
      }
    });
  });

  afterAll(async () => {
    if (scheduledTest) {
      await prisma.scheduledMockTest.delete({ where: { id: scheduledTest.id } });
    }
  });

  test('creator receives full question bank with correct answers and explanations', async () => {
    const res = await mockTestLibraryService.getTestQuestions(scheduledTest.id, testUser.id);
    expect(res.isSanitized).toBe(false);
    expect((res.questions[0] as any)?.correctOptionId).toBe('opt_1');
    expect((res.questions[0] as any)?.explanation).toBeDefined();
  });

  test('non-creator requesting active/scheduled test receives SANITIZED questions with correct answers hidden', async () => {
    const res = await mockTestLibraryService.getTestQuestions(scheduledTest.id, otherUser.id);
    expect(res.isSanitized).toBe(true);
    expect((res.questions[0] as any).correctOptionId).toBeUndefined();
    expect((res.questions[0] as any).explanation).toBeUndefined();
    expect((res.questions[0]?.options[0] as any).isCorrect).toBeUndefined();
  });
});
