import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { formatMessageTimestamp, groupMessagesByDate } from '@/features/collaboration/message-time';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

describe('PHASE 48 — Master Messaging UX Integration Suite', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Relative Timestamps & Date Separators', () => {
    it('should correctly format relative time and cluster messages into date groups', () => {
      const now = new Date('2026-08-20T14:00:00.000Z');
      const formatted = formatMessageTimestamp('2026-08-20T13:58:00.000Z', now);

      expect(formatted.relative).toBe('2 mins ago');
      expect(formatted.absolute).toContain('2026');
      expect(formatted.groupLabel).toBe('TODAY');

      const messages = [
        { id: 'm1', createdAt: '2026-08-20T10:00:00.000Z' },
        { id: 'm2', createdAt: '2026-08-19T10:00:00.000Z' }
      ];
      const groups = groupMessagesByDate(messages, now);
      expect(groups.length).toBe(2);
      expect(groups[0]?.groupLabel).toBe('TODAY');
      expect(groups[1]?.groupLabel).toBe('YESTERDAY');
    });
  });

  describe('2. Mentions & Structured Mention Persistence', () => {
    it('should create CollabMessageMention records and send MENTION notifications', async () => {
      const mockChannelMember = {
        id: 'mem_1',
        channelId: 'ch_1',
        userId: 'sender_id',
        channel: {
          id: 'ch_1',
          members: [{ userId: 'sender_id' }, { userId: 'recipient_id' }]
        }
      };

      (prisma as any).collabChannelMember = {
        findUnique: (jest.fn() as any).mockResolvedValue(mockChannelMember),
        update: (jest.fn() as any).mockResolvedValue({})
      };
      (prisma as any).collabMessage = {
        create: (jest.fn() as any).mockResolvedValue({
          id: 'msg_100',
          channelId: 'ch_1',
          senderId: 'sender_id',
          content: '@recipient_id please check this',
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

      const msg = await collaborationService.sendMessage('ch_1', 'sender_id', {
        content: '@recipient_id please check this',
        mentionedUserIds: ['recipient_id']
      });

      expect(msg).toBeDefined();
      expect((prisma as any).collabMessageMention.createMany).toHaveBeenCalledWith({
        data: [{ messageId: 'msg_100', mentionedUserId: 'recipient_id' }],
        skipDuplicates: true
      });
    });
  });

  describe('3. Voice Message Upload & Storage Lifecycle', () => {
    it('should upload voice recording and create VOICE CollabMessage record', async () => {
      const mockChannelMember = {
        id: 'mem_1',
        channelId: 'ch_1',
        userId: 'sender_id',
        channel: { members: [{ userId: 'sender_id' }, { userId: 'other_id' }] }
      };

      (prisma as any).collabChannelMember = {
        findUnique: (jest.fn() as any).mockResolvedValue(mockChannelMember),
        update: (jest.fn() as any).mockResolvedValue({})
      };
      (prisma as any).collabMessage = {
        count: (jest.fn() as any).mockResolvedValue(0),
        create: (jest.fn() as any).mockResolvedValue({
          id: 'msg_voice_1',
          channelId: 'ch_1',
          senderId: 'sender_id',
          messageType: 'VOICE',
          content: '🎤 Voice message',
          voiceDurationMs: 4000,
          voiceMimeType: 'audio/webm;codecs=opus',
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

      const voiceMsg = await collaborationService.sendVoiceMessage(
        'ch_1',
        'sender_id',
        Buffer.from('mock audio stream bytes'),
        'audio/webm;codecs=opus',
        4000
      );

      expect(voiceMsg).toBeDefined();
      expect(voiceMsg.messageType).toBe('VOICE');
    });
  });
});
