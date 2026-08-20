import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';

describe('Mock Test Security & Isolation Tests', () => {
  test('rejects test scheduling with past start time', async () => {
    const pastTime = new Date(Date.now() - 3600000);
    await expect(
      scheduledMockTestService.scheduleMockTest('user-1', {
        title: 'Past Test',
        scheduledStartTime: pastTime
      })
    ).rejects.toThrow('Scheduled start time must be in the future');
  });
});
