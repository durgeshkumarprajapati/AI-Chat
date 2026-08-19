import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';
import { CollabMemberRole } from '@prisma/client';

describe('Phase 46 — Collaboration Security & Tenant Isolation Tests', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let userC: { id: string; email: string };
  let testChannelId: string;

  beforeAll(async () => {
    // Seed 3 test users
    userA = await prisma.user.create({
      data: { email: `collab_sec_a_${Date.now()}@test.com`, name: 'User A' }
    });
    userB = await prisma.user.create({
      data: { email: `collab_sec_b_${Date.now()}@test.com`, name: 'User B' }
    });
    userC = await prisma.user.create({
      data: { email: `collab_sec_c_${Date.now()}@test.com`, name: 'User C' }
    });

    // Create a group channel owned by User A with member User B
    const channel = await collaborationService.createGroupChannel(
      userA.id,
      'Secured Group',
      'Confidential Workspace',
      [userB.id]
    );
    testChannelId = channel.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id] } }
    });
  });

  it('1. Enforces tenant isolation: Non-member (User C) cannot access channel details', async () => {
    await expect(collaborationService.getChannelDetails(testChannelId, userC.id)).rejects.toThrow(
      'Access denied: You are not a member of this conversation.'
    );
  });

  it('2. Enforces tenant isolation: Non-member (User C) cannot send messages', async () => {
    await expect(
      collaborationService.sendMessage(testChannelId, userC.id, { content: 'Unauthorized intrusion' })
    ).rejects.toThrow('Access Denied');
  });

  it('3. Enforces tenant isolation: Non-member (User C) cannot read channel message history', async () => {
    await expect(collaborationService.getMessages(testChannelId, userC.id)).rejects.toThrow('Access Denied');
  });

  it('4. Enforces RBAC permissions: Regular member (User B) cannot add new group members', async () => {
    await expect(
      collaborationService.addMember(testChannelId, userB.id, userC.id, CollabMemberRole.MEMBER)
    ).rejects.toThrow('Forbidden: Only Owners or Admins can add members');
  });

  it('5. Enforces RBAC permissions: Group Owner (User A) CAN add new members', async () => {
    const newMem = await collaborationService.addMember(
      testChannelId,
      userA.id,
      userC.id,
      CollabMemberRole.MEMBER
    );
    expect(newMem.userId).toBe(userC.id);
  });

  it('6. Enforces message edit security: User B cannot edit User A\'s message', async () => {
    const msg = await collaborationService.sendMessage(testChannelId, userA.id, { content: 'Original text' });
    await expect(collaborationService.editMessage(msg.id, userB.id, 'Hacked text')).rejects.toThrow(
      'Forbidden: You can only edit your own messages'
    );
  });
});
