import { prisma } from '@/lib/prisma';
import { CollabChannelType, CollabMemberRole } from '@prisma/client';
import { collabPubSubService } from './pubsub.service';
import { collabPresenceService } from './presence.service';
import { aiDiscussionService } from './ai-discussion.service';

export interface SendMessageInput {
  content: string;
  replyToId?: string;
  sharedRoadmapId?: string;
  sharedRoadmapStepId?: string;
  sharedEntityId?: string;
  sharedDocumentId?: string;
  sharedStudyQuestionId?: string;
  metadata?: Record<string, unknown>;
}

class CollaborationService {
  /**
   * Get existing DM channel or create new one
   */
  public async getOrCreateDirectChannel(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new Error('Cannot create direct channel with yourself');
    }

    // Check if DM exists
    const existing = await prisma.collabChannel.findFirst({
      where: {
        type: CollabChannelType.DIRECT,
        AND: [
          { members: { some: { userId: userAId } } },
          { members: { some: { userId: userBId } } }
        ]
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
          }
        }
      }
    });

    if (existing) return existing;

    // Create DM channel
    return prisma.collabChannel.create({
      data: {
        type: CollabChannelType.DIRECT,
        createdById: userAId,
        members: {
          create: [
            { userId: userAId, role: CollabMemberRole.OWNER },
            { userId: userBId, role: CollabMemberRole.MEMBER }
          ]
        }
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  /**
   * Create group channel
   */
  public async createGroupChannel(
    createdById: string,
    name: string,
    description?: string,
    memberUserIds: string[] = []
  ) {
    const uniqueUserIds = Array.from(new Set([createdById, ...memberUserIds]));

    const channel = await prisma.collabChannel.create({
      data: {
        type: CollabChannelType.GROUP,
        name: name.trim(),
        description: description?.trim() || null,
        createdById,
        members: {
          create: uniqueUserIds.map((uid) => ({
            userId: uid,
            role: uid === createdById ? CollabMemberRole.OWNER : CollabMemberRole.MEMBER
          }))
        }
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
          }
        }
      }
    });

    return channel;
  }

  /**
   * Get all user channels with unread count and latest message
   */
  public async getUserChannels(userId: string) {
    const memberships = await prisma.collabChannelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
              }
            },
            messages: {
              where: { isDeleted: false },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: { select: { id: true, name: true, email: true, avatarUrl: true } }
              }
            }
          }
        }
      },
      orderBy: { channel: { updatedAt: 'desc' } }
    });

    // Populate presence and unread counts
    const channels = await Promise.all(
      memberships.map(async (m) => {
        const ch = m.channel;
        const lastReadAt = m.lastReadAt || new Date(0);

        const unreadCount = await prisma.collabMessage.count({
          where: {
            channelId: ch.id,
            isDeleted: false,
            createdAt: { gt: lastReadAt },
            senderId: { not: userId }
          }
        });

        // Collect presence for direct channels
        const otherMembers = ch.members.filter((mem) => mem.userId !== userId);
        const otherPresence = await collabPresenceService.getMultiplePresence(
          otherMembers.map((mem) => mem.userId)
        );

        return {
          id: ch.id,
          name: ch.name,
          description: ch.description,
          type: ch.type,
          avatarUrl: ch.avatarUrl,
          createdById: ch.createdById,
          createdAt: ch.createdAt,
          updatedAt: ch.updatedAt,
          members: ch.members.map((mem) => ({
            id: mem.id,
            userId: mem.userId,
            role: mem.role,
            user: mem.user,
            presence: otherPresence[mem.userId] || { status: 'OFFLINE' }
          })),
          latestMessage: ch.messages[0] || null,
          unreadCount,
          role: m.role
        };
      })
    );

    return channels;
  }

  /**
   * Verify channel membership & retrieve details
   */
  public async getChannelDetails(channelId: string, userId: string) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      include: {
        channel: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
              }
            }
          }
        }
      }
    });

    if (!membership) {
      throw new Error('Access denied: You are not a member of this conversation.');
    }

    const memberUserIds = membership.channel.members.map((m) => m.userId);
    const presenceMap = await collabPresenceService.getMultiplePresence(memberUserIds);

    return {
      ...membership.channel,
      role: membership.role,
      members: membership.channel.members.map((m) => ({
        ...m,
        presence: presenceMap[m.userId] || { status: 'OFFLINE' }
      }))
    };
  }

  /**
   * Add group member
   */
  public async addMember(
    channelId: string,
    requestorId: string,
    newUserId: string,
    role: CollabMemberRole = CollabMemberRole.MEMBER
  ) {
    const requestorMem = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: requestorId } },
      include: { channel: true }
    });

    if (!requestorMem || requestorMem.channel.type !== CollabChannelType.GROUP) {
      throw new Error('Unauthorized or invalid group channel');
    }

    if (requestorMem.role !== CollabMemberRole.OWNER && requestorMem.role !== CollabMemberRole.ADMIN) {
      throw new Error('Forbidden: Only Owners or Admins can add members');
    }

    const newMember = await prisma.collabChannelMember.create({
      data: { channelId, userId: newUserId, role },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } }
    });

    // Notify Pub/Sub
    collabPubSubService.publish(channelId, {
      type: 'presence:change',
      channelId,
      senderId: requestorId,
      data: { action: 'member_added', member: newMember },
      timestamp: new Date().toISOString()
    });

    return newMember;
  }

  /**
   * Remove group member
   */
  public async removeMember(channelId: string, requestorId: string, targetUserId: string) {
    const requestorMem = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: requestorId } }
    });

    if (!requestorMem) throw new Error('Unauthorized');

    if (
      requestorId !== targetUserId &&
      requestorMem.role !== CollabMemberRole.OWNER &&
      requestorMem.role !== CollabMemberRole.ADMIN
    ) {
      throw new Error('Forbidden: Only Owners or Admins can remove members');
    }

    await prisma.collabChannelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } }
    });

    collabPubSubService.publish(channelId, {
      type: 'presence:change',
      channelId,
      senderId: requestorId,
      data: { action: 'member_removed', targetUserId },
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Send message with idempotency & @ai trigger
   */
  public async sendMessage(channelId: string, senderId: string, input: SendMessageInput) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: senderId } }
    });

    if (!membership) throw new Error('Access Denied: Not a member of this channel');

    // Create Message
    const message = await prisma.collabMessage.create({
      data: {
        channelId,
        senderId,
        content: input.content,
        replyToId: input.replyToId || null,
        sharedRoadmapId: input.sharedRoadmapId || null,
        sharedRoadmapStepId: input.sharedRoadmapStepId || null,
        sharedEntityId: input.sharedEntityId || null,
        sharedDocumentId: input.sharedDocumentId || null,
        sharedStudyQuestionId: input.sharedStudyQuestionId || null,
        metadata: input.metadata ? (input.metadata as any) : undefined
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true }
        },
        replyTo: {
          include: {
            sender: { select: { name: true, email: true } }
          }
        }
      }
    });

    // Update channel updatedAt timestamp
    await prisma.collabChannel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() }
    });

    // Update sender lastReadAt
    await prisma.collabChannelMember.update({
      where: { channelId_userId: { channelId, userId: senderId } },
      data: { lastReadAt: new Date(), lastReadMessageId: message.id }
    });

    // Broadcast new message
    collabPubSubService.publish(channelId, {
      type: 'message:new',
      channelId,
      senderId,
      data: message,
      timestamp: message.createdAt.toISOString()
    });

    // Handle @ai / @gemini invocation
    if (aiDiscussionService.isAiMention(input.content)) {
      // Fire AI response asynchronously
      aiDiscussionService.handleAiDiscussion(channelId, message.id, input.content, senderId).catch((err) => {
        console.error('AI discussion trigger error:', err);
      });
    }

    return message;
  }

  /**
   * Edit message
   */
  public async editMessage(messageId: string, senderId: string, newContent: string) {
    const existing = await prisma.collabMessage.findUnique({
      where: { id: messageId }
    });

    if (!existing || existing.isDeleted) {
      throw new Error('Message not found');
    }

    if (existing.senderId !== senderId) {
      throw new Error('Forbidden: You can only edit your own messages');
    }

    const updated = await prisma.collabMessage.update({
      where: { id: messageId },
      data: {
        content: newContent,
        isEdited: true
      },
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } }
      }
    });

    collabPubSubService.publish(existing.channelId, {
      type: 'message:edit',
      channelId: existing.channelId,
      senderId,
      data: updated,
      timestamp: updated.updatedAt.toISOString()
    });

    return updated;
  }

  /**
   * Soft delete message
   */
  public async deleteMessage(messageId: string, userId: string) {
    const existing = await prisma.collabMessage.findUnique({
      where: { id: messageId },
      include: { channel: { include: { members: true } } }
    });

    if (!existing) throw new Error('Message not found');

    const member = existing.channel.members.find((m) => m.userId === userId);
    if (!member) throw new Error('Access Denied');

    const isOwnerOrAdmin = member.role === CollabMemberRole.OWNER || member.role === CollabMemberRole.ADMIN;
    if (existing.senderId !== userId && !isOwnerOrAdmin) {
      throw new Error('Forbidden: Insufficient privileges to delete message');
    }

    const deleted = await prisma.collabMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: 'This message was deleted.'
      }
    });

    collabPubSubService.publish(existing.channelId, {
      type: 'message:delete',
      channelId: existing.channelId,
      senderId: userId,
      data: { messageId, channelId: existing.channelId },
      timestamp: new Date().toISOString()
    });

    return deleted;
  }

  /**
   * Get channel message history
   */
  public async getMessages(channelId: string, userId: string, take = 50) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!membership) throw new Error('Access Denied: Not a member of this channel');

    const messages = await prisma.collabMessage.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true }
        },
        replyTo: {
          include: {
            sender: { select: { name: true, email: true } }
          }
        },
        receipts: true
      }
    });

    return messages;
  }

  /**
   * Search messages across user's channels
   */
  public async searchMessages(userId: string, query: string) {
    if (!query || query.trim().length === 0) return [];

    const memberships = await prisma.collabChannelMember.findMany({
      where: { userId },
      select: { channelId: true }
    });

    const channelIds = memberships.map((m) => m.channelId);

    const matches = await prisma.collabMessage.findMany({
      where: {
        channelId: { in: channelIds },
        isDeleted: false,
        content: { contains: query, mode: 'insensitive' }
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        channel: { select: { id: true, name: true, type: true } },
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    return matches;
  }

  /**
   * Mark channel read
   */
  public async markChannelRead(channelId: string, userId: string, lastMessageId?: string) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!membership) throw new Error('Access Denied');

    await prisma.collabChannelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: {
        lastReadAt: new Date(),
        lastReadMessageId: lastMessageId || membership.lastReadMessageId
      }
    });

    collabPubSubService.publish(channelId, {
      type: 'receipt:update',
      channelId,
      senderId: userId,
      data: { channelId, userId, readAt: new Date().toISOString() },
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }
}

export const collaborationService = new CollaborationService();
