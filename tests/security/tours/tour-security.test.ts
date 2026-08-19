import { prisma } from '@/lib/prisma';
import { tourStorageService } from '@/features/tours/tour-storage.service';

describe('Tour Progress Security & Isolation Tests', () => {
  beforeAll(async () => {
    try {
      await prisma.user.upsert({
        where: { id: 'user-sec-a' },
        create: { id: 'user-sec-a', email: 'user-sec-a@example.com' },
        update: {}
      });
      await prisma.user.upsert({
        where: { id: 'user-sec-b' },
        create: { id: 'user-sec-b', email: 'user-sec-b@example.com' },
        update: {}
      });
    } catch {}
  });

  it('User A progress is isolated from User B', async () => {
    const userA = 'user-sec-a';
    const userB = 'user-sec-b';
    const tourId = 'knowledge-graph';

    await tourStorageService.saveProgress(userA, tourId, 1, 'COMPLETED', 9);

    const progB = await tourStorageService.getProgress(userB, tourId);
    expect(progB).toBeNull();
  });

  it('User B cannot overwrite User A progress', async () => {
    const userA = 'user-sec-a';
    const userB = 'user-sec-b';
    const tourId = 'study';

    await tourStorageService.saveProgress(userA, tourId, 1, 'COMPLETED', 3);
    await tourStorageService.saveProgress(userB, tourId, 1, 'SKIPPED', 0);

    const progA = await tourStorageService.getProgress(userA, tourId);
    expect(progA?.status).toBe('COMPLETED');
  });
});
