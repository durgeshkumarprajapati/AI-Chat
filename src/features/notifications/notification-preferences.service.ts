import { prisma } from '@/lib/prisma';
import { NotificationType } from '@prisma/client';
import { UserNotificationPreferences } from './notification.types';

export class NotificationPreferencesService {
  /**
   * Get user notification preferences (creates default record if none exists)
   */
  public async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    try {
      let pref = await prisma.notificationPreference.findUnique({
        where: { userId }
      });

      if (!pref) {
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (userExists) {
          pref = await prisma.notificationPreference.create({
            data: {
              userId,
              directMessages: true,
              groupMessages: true,
              mentions: true,
              groupMembership: true,
              aiReplies: true,
              roadmapShares: true
            }
          }).catch(() => null);
        }
      }

      if (pref) {
        return {
          userId: pref.userId,
          directMessages: pref.directMessages,
          groupMessages: pref.groupMessages,
          mentions: pref.mentions,
          groupMembership: pref.groupMembership,
          aiReplies: pref.aiReplies,
          roadmapShares: pref.roadmapShares
        };
      }
    } catch {}

    return {
      userId,
      directMessages: true,
      groupMessages: true,
      mentions: true,
      groupMembership: true,
      aiReplies: true,
      roadmapShares: true
    };
  }

  /**
   * Update user notification preferences
   */
  public async updatePreferences(
    userId: string,
    updates: Partial<Omit<UserNotificationPreferences, 'userId'>>
  ): Promise<UserNotificationPreferences> {
    const pref = await prisma.notificationPreference.upsert({
      where: { userId },
      update: updates,
      create: {
        userId,
        directMessages: updates.directMessages ?? true,
        groupMessages: updates.groupMessages ?? true,
        mentions: updates.mentions ?? true,
        groupMembership: updates.groupMembership ?? true,
        aiReplies: updates.aiReplies ?? true,
        roadmapShares: updates.roadmapShares ?? true
      }
    });

    return {
      userId: pref.userId,
      directMessages: pref.directMessages,
      groupMessages: pref.groupMessages,
      mentions: pref.mentions,
      groupMembership: pref.groupMembership,
      aiReplies: pref.aiReplies,
      roadmapShares: pref.roadmapShares
    };
  }

  /**
   * Check if notification type is enabled for user
   */
  public async isNotificationEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.getPreferences(userId);

    switch (type) {
      case NotificationType.MESSAGE_RECEIVED:
        return pref.directMessages || pref.groupMessages;
      case NotificationType.MENTION:
        return pref.mentions;
      case NotificationType.GROUP_MEMBER_ADDED:
      case NotificationType.GROUP_MEMBER_REMOVED:
      case NotificationType.GROUP_MEMBER_LEFT:
      case NotificationType.GROUP_OWNER_CHANGED:
        return pref.groupMembership;
      case NotificationType.AI_REPLY:
        return pref.aiReplies;
      case NotificationType.ROADMAP_SHARED:
        return pref.roadmapShares;
      default:
        return true;
    }
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
