import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Phase 46.1 — Direct Message (DM) Unit Tests', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { email: `dm_unit_a_${Date.now()}@test.com`, name: 'User A' }
    });
    userB = await prisma.user.create({
      data: { email: `dm_unit_b_${Date.now()}@test.com`, name: 'User B' }
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } }
    });
  });

  it('1. Creates a DM channel between two users', async () => {
    const channel = await collaborationService.getOrCreateDirectChannel(userA.id, userB.id);
    expect(channel.type).toBe('DIRECT');
    expect((channel as any).members).toHaveLength(2);
  });

  it('2. Returns existing DM when requested in reverse user order (canonical order test)', async () => {
    const dm1 = await collaborationService.getOrCreateDirectChannel(userA.id, userB.id);
    const dm2 = await collaborationService.getOrCreateDirectChannel(userB.id, userA.id);
    expect(dm2.id).toBe(dm1.id);
  });

  it('3. Throws error when attempting to create a DM with oneself', async () => {
    await expect(collaborationService.getOrCreateDirectChannel(userA.id, userA.id)).rejects.toThrow(
      'Cannot create direct channel with yourself'
    );
  });
});
