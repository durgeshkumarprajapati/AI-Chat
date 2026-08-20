import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('Mentions Unit Test Suite', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should process mentionedUserIds and filter out self-mentions or non-channel members', async () => {
    const mockChannelMember = {
      id: 'mem_1',
      channelId: 'ch_1',
      userId: 'user_sender',
      role: 'MEMBER',
      channel: {
        id: 'ch_1',
        members: [{ userId: 'user_sender' }, { userId: 'user_recipient_1' }, { userId: 'user_recipient_2' }]
      }
    };

    (prisma as any).collabChannelMember = {
      findUnique: (jest.fn() as any).mockResolvedValue(mockChannelMember),
      update: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessage = {
      create: (jest.fn() as any).mockResolvedValue({
        id: 'msg_ment_1',
        channelId: 'ch_1',
        senderId: 'user_sender',
        content: 'Hey @Rahul check this',
        createdAt: new Date(),
        sender: { name: 'Sender', email: 'sender@test.com' }
      })
    };
    (prisma as any).collabChannel = {
      update: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessageReceipt = {
      upsert: (jest.fn() as any).mockResolvedValue({})
    };
    (prisma as any).collabMessageMention = {
      createMany: (jest.fn() as any).mockResolvedValue({ count: 1 })
    };

    const msg = await collaborationService.sendMessage('ch_1', 'user_sender', {
      content: 'Hey @Rahul check this',
      mentionedUserIds: ['user_recipient_1', 'user_sender', 'external_user']
    });

    expect(msg).toBeDefined();
    expect((prisma as any).collabMessageMention.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'msg_ment_1', mentionedUserId: 'user_recipient_1' }],
      skipDuplicates: true
    });
  });
});
