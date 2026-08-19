import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';
import { CollabMemberRole } from '@prisma/client';

describe('Phase 46.1 — Group Member Management Unit Tests', () => {
  let owner: { id: string; email: string };
  let member1: { id: string; email: string };
  let member2: { id: string; email: string };
  let member3: { id: string; email: string };
  let groupChannelId: string;

  beforeAll(async () => {
    owner = await prisma.user.create({
      data: { email: `grp_unit_owner_${Date.now()}@test.com`, name: 'Group Owner' }
    });
    member1 = await prisma.user.create({
      data: { email: `grp_unit_m1_${Date.now()}@test.com`, name: 'Member 1' }
    });
    member2 = await prisma.user.create({
      data: { email: `grp_unit_m2_${Date.now()}@test.com`, name: 'Member 2' }
    });
    member3 = await prisma.user.create({
      data: { email: `grp_unit_m3_${Date.now()}@test.com`, name: 'Member 3' }
    });

    const channel = await collaborationService.createGroupChannel(
      owner.id,
      'Group Member Unit Test Group',
      'Testing bulk addition'
    );
    groupChannelId = channel.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, member1.id, member2.id, member3.id] } }
    });
  });

  it('1. Owner can add multiple group members in bulk', async () => {
    const members = await collaborationService.addMembers(
      groupChannelId,
      owner.id,
      [member1.id, member2.id],
      CollabMemberRole.MEMBER
    );

    expect(members).toHaveLength(2);
    const addedUserIds = members.map((m) => m.userId);
    expect(addedUserIds).toContain(member1.id);
    expect(addedUserIds).toContain(member2.id);
  });

  it('2. Prevents duplicate group memberships idempotently without throwing', async () => {
    // Attempt adding member1 again alongside member3
    const members = await collaborationService.addMembers(
      groupChannelId,
      owner.id,
      [member1.id, member3.id],
      CollabMemberRole.MEMBER
    );

    expect(members.length).toBeGreaterThanOrEqual(1);

    const totalMembers = await prisma.collabChannelMember.count({
      where: { channelId: groupChannelId }
    });

    // Owner + member1 + member2 + member3 = 4 total unique members
    expect(totalMembers).toBe(4);
  });
});
