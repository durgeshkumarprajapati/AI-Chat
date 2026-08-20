import { prisma } from '@/lib/prisma';
import { collabPubSubService } from './pubsub.service';
import { notificationService } from '@/features/notifications/notification.service';
import { CallType, CallStatus, NotificationType } from '@prisma/client';

export interface InitiateCallInput {
  channelId: string;
  type: 'VOICE' | 'VIDEO';
}

export interface CallSignalInput {
  targetUserId?: string;
  signalType: 'offer' | 'answer' | 'ice_candidate';
  signalData: unknown;
}

export class CollabCallService {
  /**
   * Initiate a Voice or Video call in a DM or Group Channel
   */
  public async initiateCall(hostId: string, input: InitiateCallInput) {
    const channelMember = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId: input.channelId, userId: hostId } },
      include: {
        channel: {
          include: {
            members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } }
          }
        }
      }
    });

    if (!channelMember) {
      throw new Error('Access Denied: Not a member of this channel');
    }

    // Check if an active call already exists in this channel
    const activeCall = await prisma.collabCall.findFirst({
      where: {
        channelId: input.channelId,
        status: { in: [CallStatus.RINGING, CallStatus.IN_CALL] }
      },
      include: {
        host: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } }
      }
    });

    if (activeCall) {
      return activeCall;
    }

    const callTypeEnum = input.type === 'VIDEO' ? CallType.VIDEO : CallType.VOICE;

    const call = await prisma.collabCall.create({
      data: {
        channelId: input.channelId,
        hostId,
        type: callTypeEnum,
        status: CallStatus.RINGING,
        participants: {
          create: channelMember.channel.members.map((m) => ({
            userId: m.userId,
            status: m.userId === hostId ? CallStatus.IN_CALL : CallStatus.RINGING,
            joinedAt: m.userId === hostId ? new Date() : null
          }))
        }
      },
      include: {
        host: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } }
      }
    });

    const hostUser = channelMember.channel.members.find((m) => m.userId === hostId)?.user;
    const hostDisplayName = hostUser?.name || hostUser?.email.split('@')[0] || 'Member';

    // Broadcast SSE invitation event to channel members
    collabPubSubService.publish(input.channelId, {
      eventId: `evt_call_${Date.now()}`,
      type: 'call:invite',
      channelId: input.channelId,
      senderId: hostId,
      data: {
        callId: call.id,
        channelId: input.channelId,
        hostId,
        hostName: hostDisplayName,
        callType: input.type,
        status: CallStatus.RINGING
      },
      timestamp: new Date().toISOString()
    });

    // Send notifications to recipients
    const recipientIds = channelMember.channel.members
      .map((m) => m.userId)
      .filter((uid) => uid !== hostId);

    for (const recipientId of recipientIds) {
      notificationService.createNotification({
        userId: recipientId,
        type: NotificationType.CALL_INCOMING,
        title: `Incoming ${input.type} Call`,
        body: `${hostDisplayName} is calling in ${channelMember.channel.name || 'chat'}`,
        channelId: input.channelId,
        actorUserId: hostId
      }).catch(() => {});
    }

    return call;
  }

  /**
   * Relay WebRTC Signals (SDP Offer/Answer or ICE Candidate) via SSE
   */
  public async relaySignal(callId: string, senderId: string, input: CallSignalInput) {
    const call = await prisma.collabCall.findUnique({
      where: { id: callId }
    });
    if (!call || call.status === CallStatus.ENDED) {
      throw new Error('Call is no longer active');
    }

    collabPubSubService.publish(call.channelId, {
      eventId: `evt_sig_${Date.now()}`,
      type: 'call:ice_candidate',
      channelId: call.channelId,
      senderId,
      targetUserId: input.targetUserId,
      data: {
        callId,
        senderId,
        signalType: input.signalType,
        signalData: input.signalData
      },
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Handle Call Participant Action (Accept, Decline, Toggle Mute/Video, End Call)
   */
  public async handleCallAction(
    callId: string,
    userId: string,
    action: 'accept' | 'decline' | 'mute' | 'unmute' | 'video_off' | 'video_on' | 'end'
  ) {
    const call = await prisma.collabCall.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });

    if (!call) throw new Error('Call not found');

    const participant = call.participants.find((p) => p.userId === userId);
    if (!participant) throw new Error('Not a participant in this call');

    if (action === 'accept') {
      await prisma.collabCallParticipant.update({
        where: { id: participant.id },
        data: { status: CallStatus.IN_CALL, joinedAt: new Date() }
      });

      await prisma.collabCall.update({
        where: { id: callId },
        data: { status: CallStatus.IN_CALL, startedAt: call.startedAt || new Date() }
      });

      collabPubSubService.publish(call.channelId, {
        eventId: `evt_accept_${Date.now()}`,
        type: 'call:accept',
        channelId: call.channelId,
        senderId: userId,
        data: { callId, userId },
        timestamp: new Date().toISOString()
      });
    } else if (action === 'decline') {
      await prisma.collabCallParticipant.update({
        where: { id: participant.id },
        data: { status: CallStatus.DECLINED }
      });

      collabPubSubService.publish(call.channelId, {
        eventId: `evt_dec_${Date.now()}`,
        type: 'call:decline',
        channelId: call.channelId,
        senderId: userId,
        data: { callId, userId },
        timestamp: new Date().toISOString()
      });
    } else if (action === 'end') {
      const endedAt = new Date();
      const startedAt = call.startedAt || call.createdAt;
      const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

      await prisma.collabCall.update({
        where: { id: callId },
        data: { status: CallStatus.ENDED, endedAt, durationSeconds }
      });

      await prisma.collabCallParticipant.updateMany({
        where: { callId },
        data: { status: CallStatus.ENDED, leftAt: endedAt }
      });

      collabPubSubService.publish(call.channelId, {
        eventId: `evt_end_${Date.now()}`,
        type: 'call:end',
        channelId: call.channelId,
        senderId: userId,
        data: { callId, endedBy: userId, durationSeconds },
        timestamp: new Date().toISOString()
      });
    }

    return { success: true };
  }

  /**
   * Get active call status for a channel
   */
  public async getActiveCall(channelId: string) {
    return prisma.collabCall.findFirst({
      where: {
        channelId,
        status: { in: [CallStatus.RINGING, CallStatus.IN_CALL] }
      },
      include: {
        host: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } }
      }
    });
  }
}

export const collabCallService = new CollabCallService();
