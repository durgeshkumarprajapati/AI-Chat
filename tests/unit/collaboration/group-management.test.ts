import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';
import { CollabChannelType, CollabMemberRole } from '@prisma/client';

describe('Group Management Unit Tests (Phase 47)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should prevent non-owner/non-admin members from removing group members', async () => {
    jest.spyOn(prisma.collabChannel, 'findUnique').mockResolvedValue({
      id: 'channel_1',
      name: 'Test Group',
      type: CollabChannelType.GROUP,
      members: [
        { channelId: 'channel_1', userId: 'user_member', role: CollabMemberRole.MEMBER },
        { channelId: 'channel_1', userId: 'user_target', role: CollabMemberRole.MEMBER }
      ]
    } as any);

    await expect(
      collaborationService.removeMember('channel_1', 'user_member', 'user_target')
    ).rejects.toThrow('Forbidden: Only Owners or Admins can remove members');
  });

  it('should prevent removing the group owner', async () => {
    jest.spyOn(prisma.collabChannel, 'findUnique').mockResolvedValue({
      id: 'channel_1',
      name: 'Test Group',
      type: CollabChannelType.GROUP,
      members: [
        { channelId: 'channel_1', userId: 'user_admin', role: CollabMemberRole.ADMIN },
        { channelId: 'channel_1', userId: 'user_owner', role: CollabMemberRole.OWNER }
      ]
    } as any);

    await expect(
      collaborationService.removeMember('channel_1', 'user_admin', 'user_owner')
    ).rejects.toThrow('Forbidden: Cannot remove group owner');
  });

  it('should prevent owner from leaving without transferring ownership if other members exist', async () => {
    jest.spyOn(prisma.collabChannel, 'findUnique').mockResolvedValue({
      id: 'channel_1',
      name: 'Test Group',
      type: CollabChannelType.GROUP,
      members: [
        { channelId: 'channel_1', userId: 'user_owner', role: CollabMemberRole.OWNER },
        { channelId: 'channel_1', userId: 'user_member', role: CollabMemberRole.MEMBER }
      ]
    } as any);

    await expect(
      collaborationService.leaveChannel('channel_1', 'user_owner')
    ).rejects.toThrow('Owner must transfer ownership before leaving the group');
  });

  it('should allow owner to transfer ownership to an existing member', async () => {
    jest.spyOn(prisma.collabChannel, 'findUnique').mockResolvedValue({
      id: 'channel_1',
      name: 'Test Group',
      type: CollabChannelType.GROUP,
      members: [
        { channelId: 'channel_1', userId: 'user_owner', role: CollabMemberRole.OWNER },
        { channelId: 'channel_1', userId: 'user_new_owner', role: CollabMemberRole.MEMBER }
      ]
    } as any);

    jest.spyOn(prisma, '$transaction').mockResolvedValue([{}, {}, {}] as any);

    const res = await collaborationService.transferOwnership('channel_1', 'user_owner', 'user_new_owner');
    expect(res.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
