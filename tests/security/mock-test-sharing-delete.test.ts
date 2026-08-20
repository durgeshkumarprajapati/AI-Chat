import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';
import { prisma } from '@/lib/prisma';

describe('Scheduled Mock Test Deletion & Sharing Security Tests', () => {
  let creatorId: string;
  let nonCreatorId: string;
  let testMockTestId: string;

  beforeAll(async () => {
    // Find or create test users
    let user1 = await prisma.user.findFirst({ where: { email: 'creator_test@example.com' } });
    if (!user1) {
      user1 = await prisma.user.create({
        data: {
          email: 'creator_test@example.com',
          name: 'Test Creator',
          passwordHash: 'dummy_hash'
        }
      });
    }
    creatorId = user1.id;

    let user2 = await prisma.user.findFirst({ where: { email: 'non_creator_test@example.com' } });
    if (!user2) {
      user2 = await prisma.user.create({
        data: {
          email: 'non_creator_test@example.com',
          name: 'Test Non-Creator',
          passwordHash: 'dummy_hash'
        }
      });
    }
    nonCreatorId = user2.id;

    // Create dummy mock test for security test
    const created = await prisma.scheduledMockTest.create({
      data: {
        createdById: creatorId,
        title: 'Security Test Mock Test',
        topic: 'Cybersecurity',
        scheduledStartTime: new Date(Date.now() + 3600000),
        durationMinutes: 30,
        totalQuestions: 5,
        status: 'SCHEDULED'
      }
    });
    testMockTestId = created.id;
  });

  afterAll(async () => {
    try {
      if (testMockTestId) {
        const existing = await prisma.scheduledMockTest.findUnique({ where: { id: testMockTestId } });
        if (existing) {
          await prisma.scheduledMockTest.delete({ where: { id: testMockTestId } });
        }
      }
    } catch {
      // safe cleanup
    }
  });

  test('Non-creator cannot delete mock test (Forbidden error)', async () => {
    await expect(
      mockTestLibraryService.deleteMockTest(testMockTestId, nonCreatorId)
    ).rejects.toThrow('Forbidden: Only the creator of this mock test can delete it');
  });

  test('Creator can delete their own mock test successfully', async () => {
    const res = await mockTestLibraryService.deleteMockTest(testMockTestId, creatorId);
    expect(res.success).toBe(true);

    const deleted = await prisma.scheduledMockTest.findUnique({
      where: { id: testMockTestId }
    });
    expect(deleted).toBeNull();
  });
});
