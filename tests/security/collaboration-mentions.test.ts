import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Security: Collaboration Mentions & Tenant Isolation', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should prevent mentioning external users outside channel membership', async () => {
    const mockMembership = {
      id: 'mem_1',
      channelId: 'ch_group',
      userId: 'user_attacker',
      channel: {
        id: 'ch_group',
        members: [{ userId: 'user_attacker' }, { userId: 'user_valid' }]
      }
    };

    (prisma as any).collabChannelMember = {
      findUnique: (jest.fn() as any).mockResolvedValue(mockMembership),
      update: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessage = {
      create: (jest.fn() as any).mockResolvedValue({
        id: 'msg_sec_1',
        channelId: 'ch_group',
        senderId: 'user_attacker',
        content: 'Sneaky mention @victim',
        createdAt: new Date(),
        sender: { name: 'Attacker', email: 'attacker@test.com' }
      })
    };
    (prisma as any).collabChannel = {
      update: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessageReceipt = {
      upsert: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessageMention = {
      createMany: (jest.fn() as any).mockResolvedValue({ count: 0 })
    };

    await collaborationService.sendMessage('ch_group', 'user_attacker', {
      content: 'Sneaky mention @victim',
      mentionedUserIds: ['external_user_victim']
    });

    expect((prisma as any).collabMessageMention.createMany).not.toHaveBeenCalledWith({
      data: expect.arrayContaining([{ messageId: 'msg_sec_1', mentionedUserId: 'external_user_victim' }]),
      skipDuplicates: true
    });
  });
});
