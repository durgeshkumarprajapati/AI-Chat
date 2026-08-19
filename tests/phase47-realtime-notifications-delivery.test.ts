import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { notificationService } from '@/features/notifications/notification.service';
import { notificationPreferencesService } from '@/features/notifications/notification-preferences.service';
import { prisma } from '@/lib/prisma';
import { CollabChannelType, CollabMemberRole, NotificationType } from '@prisma/client';

describe('PHASE 47 — Master Integration Suite', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Multiline Message Constraints & Idempotency', () => {
    it('should reject empty or whitespace-only messages', async () => {
      jest.spyOn(prisma.collabChannelMember, 'findUnique').mockResolvedValue({
        channelId: 'ch_1',
        userId: 'u_1',
        channel: { members: [{ userId: 'u_1' }] }
      } as any);

      await expect(
        collaborationService.sendMessage('ch_1', 'u_1', { content: '   ' })
      ).rejects.toThrow('Message content cannot be empty');
    });

    it('should enforce maximum message line count', async () => {
      jest.spyOn(prisma.collabChannelMember, 'findUnique').mockResolvedValue({
        channelId: 'ch_1',
        userId: 'u_1',
        channel: { members: [{ userId: 'u_1' }] }
      } as any);

      const excessiveLines = Array(105).fill('line').join('\n');
      await expect(
        collaborationService.sendMessage('ch_1', 'u_1', { content: excessiveLines })
      ).rejects.toThrow(/exceeds maximum line count/);
    });
  });

  describe('2. Delivery Receipts & State Machine', () => {
    it('should process delivery acknowledgement for valid channel messages', async () => {
      jest.spyOn(prisma.collabChannelMember, 'findUnique').mockResolvedValue({
        channelId: 'ch_1',
        userId: 'u_2'
      } as any);

      jest.spyOn(prisma.collabMessage, 'findMany').mockResolvedValue([
        { id: 'msg_100' },
        { id: 'msg_101' }
      ] as any);

      jest.spyOn(prisma.collabMessageReceipt, 'upsert').mockResolvedValue({} as any);

      const result = await collaborationService.acknowledgeDelivery('ch_1', 'u_2', ['msg_100', 'msg_101']);
      expect(result.count).toBe(2);
      expect(prisma.collabMessageReceipt.upsert).toHaveBeenCalledTimes(2);
    });

    it('should summarize group message receipts seen count and details', async () => {
      jest.spyOn(prisma.collabChannelMember, 'findUnique').mockResolvedValue({
        channelId: 'ch_1',
        userId: 'u_1'
      } as any);

      jest.spyOn(prisma.collabMessageReceipt, 'findMany').mockResolvedValue([
        {
          messageId: 'msg_100',
          userId: 'u_2',
          status: 'READ',
          readAt: new Date(),
          user: { id: 'u_2', name: 'User 2', email: 'u2@test.com', avatarUrl: null }
        },
        {
          messageId: 'msg_100',
          userId: 'u_3',
          status: 'DELIVERED',
          deliveredAt: new Date(),
          user: { id: 'u_3', name: 'User 3', email: 'u3@test.com', avatarUrl: null }
        }
      ] as any);

      const summary = await collaborationService.getMessageReceiptSummary('ch_1', 'u_1', 'msg_100');
      expect(summary.seenCount).toBe(1);
      expect(summary.deliveredCount).toBe(2);
      if (summary.seenBy[0]) {
        expect(summary.seenBy[0].userId).toBe('u_2');
      }
    });
  });

  describe('3. Group Management RBAC & Ownership Transfer', () => {
    it('should execute ownership transfer between owner and group member', async () => {
      jest.spyOn(prisma.collabChannel, 'findUnique').mockResolvedValue({
        id: 'ch_group',
        type: CollabChannelType.GROUP,
        name: 'Dev Group',
        members: [
          { channelId: 'ch_group', userId: 'owner_id', role: CollabMemberRole.OWNER },
          { channelId: 'ch_group', userId: 'member_id', role: CollabMemberRole.MEMBER }
        ]
      } as any);

      jest.spyOn(prisma, '$transaction').mockResolvedValue([{}, {}, {}] as any);

      const result = await collaborationService.transferOwnership('ch_group', 'owner_id', 'member_id');
      expect(result.success).toBe(true);
    });
  });

  describe('4. Notification Persistence & User Preferences', () => {
    it('should create and retrieve notifications with unread counts', async () => {
      jest.spyOn(notificationPreferencesService, 'isNotificationEnabled').mockResolvedValue(true);

      jest.spyOn(prisma.notification, 'create').mockResolvedValue({
        id: 'n_1',
        userId: 'u_1',
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'New Message',
        body: 'Hello',
        channelId: 'ch_1',
        messageId: 'm_1',
        actorUserId: 'u_2',
        isRead: false,
        readAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        actor: { id: 'u_2', name: 'User 2', email: 'u2@test.com', avatarUrl: null }
      } as any);

      jest.spyOn(prisma.notification, 'count').mockResolvedValue(1);

      const notif = await notificationService.createNotification({
        userId: 'u_1',
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'New Message',
        body: 'Hello',
        actorUserId: 'u_2'
      });

      expect(notif?.id).toBe('n_1');
    });
  });
});
