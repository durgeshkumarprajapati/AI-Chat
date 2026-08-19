import { prisma } from '@/lib/prisma';
import { CollabChannelType, CollabMemberRole, NotificationType, CollabReceiptStatus } from '@prisma/client';
import { collabPubSubService } from './pubsub.service';
import { collabPresenceService } from './presence.service';
import { aiDiscussionService } from './ai-discussion.service';
import { notificationService } from '@/features/notifications/notification.service';

export interface SendMessageInput {
  content: string;
  replyToId?: string;
  sharedRoadmapId?: string;
  sharedRoadmapStepId?: string;
  sharedEntityId?: string;
  sharedDocumentId?: string;
  sharedStudyQuestionId?: string;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
}

class CollaborationService {
  /**
   * Get existing DM channel or create new one with canonical user ordering
   */
  public async getOrCreateDirectChannel(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new Error('Cannot create direct channel with yourself');
    }

    // Sort user IDs to ensure canonical ordering
    const [firstId, secondId] = [userAId, userBId].sort();

    // Check if DM exists
    const existing = await prisma.collabChannel.findFirst({
      where: {
        type: CollabChannelType.DIRECT,
        AND: [
          { members: { some: { userId: firstId } } },
          { members: { some: { userId: secondId } } }
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
    try {
      return await prisma.collabChannel.create({
        data: {
          type: CollabChannelType.DIRECT,
          createdById: userAId,
          members: {
            create: [
              { userId: firstId!, role: CollabMemberRole.OWNER },
              { userId: secondId!, role: CollabMemberRole.MEMBER }
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
    } catch {
      // In case of concurrent creation race, re-query existing
      const reChecked = await prisma.collabChannel.findFirst({
        where: {
          type: CollabChannelType.DIRECT,
          AND: [
            { members: { some: { userId: firstId } } },
            { members: { some: { userId: secondId } } }
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
      if (reChecked) return reChecked;
      throw new Error('Failed to create direct channel');
    }
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
   * Add group members (supports single userId or array of userIds idempotently)
   */
  public async addMembers(
    channelId: string,
    requestorId: string,
    targetUserIds: string | string[],
    role: CollabMemberRole = CollabMemberRole.MEMBER
  ) {
    const userIdsToAdd = Array.isArray(targetUserIds) ? targetUserIds : [targetUserIds];
    const uniqueUserIds = Array.from(new Set(userIdsToAdd.filter(Boolean)));

    if (uniqueUserIds.length === 0) {
      throw new Error('No user IDs provided');
    }

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

    const existingMembers = await prisma.collabChannelMember.findMany({
      where: { channelId, userId: { in: uniqueUserIds } },
      select: { userId: true }
    });
    const existingUserIds = new Set(existingMembers.map((m) => m.userId));

    const newUsersToInsert = uniqueUserIds.filter((uid) => !existingUserIds.has(uid));

    if (newUsersToInsert.length > 0) {
      await prisma.collabChannelMember.createMany({
        data: newUsersToInsert.map((uid) => ({
          channelId,
          userId: uid,
          role
        })),
        skipDuplicates: true
      });
    }

    const updatedMembers = await prisma.collabChannelMember.findMany({
      where: { channelId, userId: { in: uniqueUserIds } },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } }
    });

    collabPubSubService.publish(channelId, {
      type: 'presence:change',
      channelId,
      senderId: requestorId,
      data: { action: 'members_added', members: updatedMembers },
      timestamp: new Date().toISOString()
    });

    return updatedMembers;
  }

  public async addMember(
    channelId: string,
    requestorId: string,
    newUserId: string,
    role: CollabMemberRole = CollabMemberRole.MEMBER
  ) {
    const res = await this.addMembers(channelId, requestorId, [newUserId], role);
    return res[0];
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
   * Remove group member with RBAC enforcement
   */
  public async removeMember(channelId: string, requestorId: string, targetUserId: string) {
    const channel = await prisma.collabChannel.findUnique({
      where: { id: channelId },
      include: { members: true }
    });

    if (!channel || channel.type !== CollabChannelType.GROUP) {
      throw new Error('Invalid or non-existent group channel');
    }

    const requestorMem = channel.members.find((m) => m.userId === requestorId);
    if (!requestorMem) throw new Error('Unauthorized');

    const targetMem = channel.members.find((m) => m.userId === targetUserId);
    if (!targetMem) throw new Error('Target user is not a member of this group');

    if (targetMem.role === CollabMemberRole.OWNER) {
      throw new Error('Forbidden: Cannot remove group owner');
    }

    if (
      requestorId !== targetUserId &&
      requestorMem.role !== CollabMemberRole.OWNER &&
      requestorMem.role !== CollabMemberRole.ADMIN
    ) {
      throw new Error('Forbidden: Only Owners or Admins can remove members');
    }

    if (requestorMem.role === CollabMemberRole.ADMIN && targetMem.role === CollabMemberRole.ADMIN) {
      throw new Error('Forbidden: Admins cannot remove other admins');
    }

    await prisma.collabChannelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } }
    });

    const eventId = `evt_rem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'member:removed',
      channelId,
      senderId: requestorId,
      targetUserId,
      data: {
        eventId,
        type: 'member:removed',
        channelId,
        userId: targetUserId,
        removedBy: requestorId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    // Send notification to removed user
    notificationService.createNotification({
      userId: targetUserId,
      type: NotificationType.GROUP_MEMBER_REMOVED,
      title: 'Removed from Group',
      body: `You were removed from ${channel.name || 'a group discussion'}`,
      channelId,
      actorUserId: requestorId
    }).catch(() => {});

    return { success: true };
  }

  /**
   * Member self-leave group
   */
  public async leaveChannel(channelId: string, userId: string) {
    const channel = await prisma.collabChannel.findUnique({
      where: { id: channelId },
      include: { members: true }
    });

    if (!channel || channel.type !== CollabChannelType.GROUP) {
      throw new Error('Invalid or non-existent group channel');
    }

    const member = channel.members.find((m) => m.userId === userId);
    if (!member) throw new Error('Not a member of this channel');

    if (member.role === CollabMemberRole.OWNER && channel.members.length > 1) {
      throw new Error('Owner must transfer ownership before leaving the group');
    }

    await prisma.collabChannelMember.delete({
      where: { channelId_userId: { channelId, userId } }
    });

    const eventId = `evt_left_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'member:left',
      channelId,
      senderId: userId,
      data: {
        eventId,
        type: 'member:left',
        channelId,
        userId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Transfer group ownership
   */
  public async transferOwnership(channelId: string, currentOwnerId: string, newOwnerId: string) {
    if (currentOwnerId === newOwnerId) {
      throw new Error('Target user is already the group owner');
    }

    const channel = await prisma.collabChannel.findUnique({
      where: { id: channelId },
      include: { members: true }
    });

    if (!channel || channel.type !== CollabChannelType.GROUP) {
      throw new Error('Invalid or non-existent group channel');
    }

    const ownerMem = channel.members.find((m) => m.userId === currentOwnerId);
    if (!ownerMem || ownerMem.role !== CollabMemberRole.OWNER) {
      throw new Error('Forbidden: Only the current group owner can transfer ownership');
    }

    const targetMem = channel.members.find((m) => m.userId === newOwnerId);
    if (!targetMem) {
      throw new Error('Target user must be an existing group member');
    }

    // Atomic role update
    await prisma.$transaction([
      prisma.collabChannelMember.update({
        where: { channelId_userId: { channelId, userId: currentOwnerId } },
        data: { role: CollabMemberRole.ADMIN }
      }),
      prisma.collabChannelMember.update({
        where: { channelId_userId: { channelId, userId: newOwnerId } },
        data: { role: CollabMemberRole.OWNER }
      }),
      prisma.collabChannel.update({
        where: { id: channelId },
        data: { createdById: newOwnerId }
      })
    ]);

    const eventId = `evt_own_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'member:owner_changed',
      channelId,
      senderId: currentOwnerId,
      data: {
        eventId,
        type: 'member:owner_changed',
        channelId,
        previousOwnerId: currentOwnerId,
        newOwnerId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    notificationService.createNotification({
      userId: newOwnerId,
      type: NotificationType.GROUP_OWNER_CHANGED,
      title: 'Group Ownership Transferred',
      body: `You are now the owner of ${channel.name || 'a group discussion'}`,
      channelId,
      actorUserId: currentOwnerId
    }).catch(() => {});

    return { success: true };
  }

  /**
   * Send message with idempotency & @ai trigger
   */
  public async sendMessage(channelId: string, senderId: string, input: SendMessageInput) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: senderId } },
      include: {
        channel: {
          include: {
            members: { select: { userId: true } }
          }
        }
      }
    });

    if (!membership) throw new Error('Access Denied: Not a member of this channel');

    // Multiline & Payload Validations
    const MAX_LENGTH = parseInt(process.env.COLLAB_MAX_MESSAGE_LENGTH || '4000', 10);
    const MAX_LINES = parseInt(process.env.COLLAB_MAX_MESSAGE_LINES || '100', 10);
    const MAX_BYTES = parseInt(process.env.COLLAB_MAX_MESSAGE_BYTES || '16384', 10);

    if (!input.content || !input.content.trim()) {
      throw new Error('Message content cannot be empty');
    }
    if (input.content.length > MAX_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${MAX_LENGTH} characters`);
    }
    const lineCount = input.content.split('\n').length;
    if (lineCount > MAX_LINES) {
      throw new Error(`Message exceeds maximum line count of ${MAX_LINES} lines`);
    }
    const byteCount = Buffer.byteLength(input.content, 'utf8');
    if (byteCount > MAX_BYTES) {
      throw new Error(`Message exceeds maximum payload size of ${MAX_BYTES} bytes`);
    }

    // Idempotency check: Return existing message if clientMessageId already processed
    if (input.clientMessageId) {
      const existing = await prisma.collabMessage.findUnique({
        where: { channelId_clientMessageId: { channelId, clientMessageId: input.clientMessageId } },
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
      if (existing) return existing;
    }

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
        clientMessageId: input.clientMessageId || null,
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

    // Create delivery receipt for sender
    await prisma.collabMessageReceipt.upsert({
      where: { messageId_userId: { messageId: message.id, userId: senderId } },
      create: {
        messageId: message.id,
        userId: senderId,
        status: CollabReceiptStatus.READ,
        deliveredAt: message.createdAt,
        readAt: message.createdAt
      },
      update: {
        status: CollabReceiptStatus.READ,
        readAt: message.createdAt
      }
    });

    // Broadcast new message
    const eventId = `evt_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'message:new',
      channelId,
      senderId,
      data: message,
      timestamp: message.createdAt.toISOString()
    });

    // Send notifications to recipients
    const recipientIds = membership.channel.members
      .map((m) => m.userId)
      .filter((uid) => uid !== senderId);

    const senderDisplayName = message.sender.name || message.sender.email.split('@')[0];

    for (const recipientId of recipientIds) {
      notificationService.createNotification({
        userId: recipientId,
        type: NotificationType.MESSAGE_RECEIVED,
        title: `Message from ${senderDisplayName}`,
        body: input.content.length > 100 ? `${input.content.substring(0, 97)}...` : input.content,
        channelId,
        messageId: message.id,
        actorUserId: senderId
      }).catch(() => {});
    }

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
   * Delivery acknowledgement for message IDs
   */
  public async acknowledgeDelivery(channelId: string, userId: string, messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return { count: 0 };

    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!membership) throw new Error('Access Denied: Not a member of this channel');

    // Verify messages belong to channel
    const validMessages = await prisma.collabMessage.findMany({
      where: { id: { in: messageIds }, channelId },
      select: { id: true }
    });

    const validIds = validMessages.map((m) => m.id);
    if (validIds.length === 0) return { count: 0 };

    const now = new Date();

    // Upsert receipts for recipient
    await Promise.all(
      validIds.map((msgId) =>
        prisma.collabMessageReceipt.upsert({
          where: { messageId_userId: { messageId: msgId, userId } },
          create: {
            messageId: msgId,
            userId,
            status: CollabReceiptStatus.DELIVERED,
            deliveredAt: now
          },
          update: {
            deliveredAt: now
          }
        })
      )
    );

    const eventId = `evt_deliv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'message:delivered',
      channelId,
      senderId: userId,
      data: { channelId, userId, messageIds: validIds, deliveredAt: now.toISOString() },
      timestamp: now.toISOString()
    });

    return { count: validIds.length };
  }

  /**
   * Mark channel read with receipt updates
   */
  public async markChannelRead(channelId: string, userId: string, lastMessageId?: string) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!membership) throw new Error('Access Denied');

    const now = new Date();

    // Find all messages in channel sent by other users
    const unreadMessages = await prisma.collabMessage.findMany({
      where: {
        channelId,
        senderId: { not: userId }
      },
      select: { id: true }
    });

    const unreadMsgIds = unreadMessages.map((m) => m.id);

    // Batch upsert read receipts for user
    if (unreadMsgIds.length > 0) {
      await Promise.all(
        unreadMsgIds.map((msgId) =>
          prisma.collabMessageReceipt.upsert({
            where: { messageId_userId: { messageId: msgId, userId } },
            create: {
              messageId: msgId,
              userId,
              status: CollabReceiptStatus.READ,
              deliveredAt: now,
              readAt: now
            },
            update: {
              status: CollabReceiptStatus.READ,
              readAt: now
            }
          })
        )
      );
    }

    await prisma.collabChannelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: {
        lastReadAt: now,
        lastReadMessageId: lastMessageId || membership.lastReadMessageId
      }
    });

    const eventId = `evt_read_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    collabPubSubService.publish(channelId, {
      eventId,
      type: 'message:read',
      channelId,
      senderId: userId,
      data: { channelId, userId, lastReadMessageId: lastMessageId || membership.lastReadMessageId, readAt: now.toISOString() },
      timestamp: now.toISOString()
    });

    return { success: true };
  }

  /**
   * Get message receipt summary for group chat
   */
  public async getMessageReceiptSummary(channelId: string, userId: string, messageId: string) {
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!membership) throw new Error('Access Denied');

    const receipts = await prisma.collabMessageReceipt.findMany({
      where: { messageId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    const seenBy = receipts
      .filter((r) => r.status === CollabReceiptStatus.READ)
      .map((r) => ({ userId: r.userId, user: r.user, readAt: r.readAt }));

    const deliveredTo = receipts
      .filter((r) => r.status === CollabReceiptStatus.DELIVERED || r.status === CollabReceiptStatus.READ)
      .map((r) => ({ userId: r.userId, user: r.user, deliveredAt: r.deliveredAt }));

    return {
      messageId,
      seenCount: seenBy.length,
      deliveredCount: deliveredTo.length,
      seenBy,
      deliveredTo
    };
  }
}

export const collaborationService = new CollaborationService();
