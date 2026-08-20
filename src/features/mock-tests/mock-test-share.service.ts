import { prisma } from '@/lib/prisma';
import { notificationService } from '@/features/notifications/notification.service';
import { NotificationType } from '@prisma/client';

export class MockTestShareService {
  /**
   * Shares a Mock Test into a DM or Group Chat Channel
   */
  public async shareTestToChannel(mockTestId: string, channelId: string, senderId: string) {
    // 1. Verify channel membership
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: senderId } },
      include: {
        channel: {
          include: {
            members: { include: { user: { select: { id: true, name: true, email: true } } } }
          }
        }
      }
    });

    if (!membership) {
      throw new Error('Access Denied: Sender does not belong to target channel');
    }

    // 2. Fetch Mock Test
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });
    if (!mockTest) {
      throw new Error('Mock test not found');
    }

    // 3. Create CollabMessage attachment
    const senderName = membership.channel.members.find((m) => m.userId === senderId)?.user.name || 'Member';

    const message = await prisma.collabMessage.create({
      data: {
        channelId,
        senderId,
        content: `📝 Scheduled AI Mock Test: "${mockTest.title}"`,
        sharedMockTestId: mockTest.id
      },
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        sharedMockTest: true
      }
    });

    // 4. Send Notifications to eligible recipients
    const recipients = membership.channel.members.filter((m) => m.userId !== senderId);
    for (const r of recipients) {
      // Register participant record for channel member if not already registered
      await prisma.mockTestParticipant.upsert({
        where: { mockTestId_userId: { mockTestId: mockTest.id, userId: r.userId } },
        create: {
          mockTestId: mockTest.id,
          userId: r.userId
        },
        update: {}
      });

      notificationService.createNotification({
        userId: r.userId,
        type: NotificationType.MOCK_TEST_INVITATION,
        title: `📝 Mock Test Shared`,
        body: `${senderName} shared "${mockTest.title}" in ${membership.channel.name || 'chat'}`,
        channelId,
        messageId: message.id,
        actorUserId: senderId
      }).catch(() => {});
    }

    return { success: true, message, mockTest };
  }
}

export const mockTestShareService = new MockTestShareService();
