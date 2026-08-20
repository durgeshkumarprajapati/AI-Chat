import { prisma } from '@/lib/prisma';
import { callHistoryRepository } from './call-history.repository';
import { callHistoryTelemetryService } from './call-history.telemetry.service';
import { CallHistoryQueryFilters } from './call-history.types';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import { notificationService } from '@/features/notifications/notification.service';
import { CollabMessageType, NotificationType, CallStatus } from '@prisma/client';

export class CallHistoryService {
  public async getCallHistory(userId: string, filters: CallHistoryQueryFilters) {
    try {
      callHistoryTelemetryService.logViewed(userId, Object.keys(filters).length);
      return await callHistoryRepository.getCallHistoryForUser(userId, filters);
    } catch (err) {
      callHistoryTelemetryService.logQueryFailed(userId, err);
      throw err;
    }
  }

  public async getChannelCallHistory(userId: string, channelId: string, page = 1, limit = 20) {
    return this.getCallHistory(userId, { channelId, page, limit });
  }

  public async getCallDetails(callId: string, userId: string) {
    callHistoryTelemetryService.logItemOpened(userId, callId);
    return callHistoryRepository.getCallDetails(callId, userId);
  }

  public async getMissedCallCount(userId: string) {
    return { count: await callHistoryRepository.getMissedCallCount(userId) };
  }

  /**
   * Creates a structured Call Event message inside the chat timeline when a call ends
   */
  public async createCallEventMessage(callSessionId: string) {
    const call = await prisma.collabCall.findUnique({
      where: { id: callSessionId },
      include: {
        channel: {
          include: {
            members: { select: { userId: true } }
          }
        },
        host: { select: { id: true, name: true } },
        participants: { select: { userId: true, status: true } }
      }
    });

    if (!call) return null;

    const isGroup = call.channel.type === 'GROUP' || call.participants.length > 2;
    const callTypeStr = call.type === 'VIDEO' ? '📹 Video Call' : '📞 Voice Call';
    let contentText = `${callTypeStr} ended (${call.durationSeconds || 0}s)`;

    if (call.status === CallStatus.MISSED) {
      contentText = `📞 Missed ${call.type === 'VIDEO' ? 'video' : 'voice'} call`;
    } else if (call.status === CallStatus.DECLINED) {
      contentText = `🚫 ${call.type === 'VIDEO' ? 'Video' : 'Voice'} call declined`;
    } else if (isGroup) {
      contentText = `📹 Group ${call.type === 'VIDEO' ? 'video' : 'voice'} call (${call.participants.length} participants, ${call.durationSeconds || 0}s)`;
    }

    // Create structured CollabMessage with messageType = CALL_EVENT
    const message = await prisma.collabMessage.create({
      data: {
        channelId: call.channelId,
        senderId: call.hostId,
        messageType: CollabMessageType.CALL_EVENT,
        content: contentText,
        callSessionId: call.id,
        metadata: {
          callId: call.id,
          callType: call.type,
          status: call.status,
          durationSeconds: call.durationSeconds || 0,
          isGroup
        }
      },
      include: {
        sender: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        callSession: {
          include: {
            host: { select: { id: true, name: true, avatarUrl: true } },
            participants: { select: { id: true, userId: true, status: true } }
          }
        }
      }
    });

    callHistoryTelemetryService.logEventCreated(call.channelId, call.id, call.status);

    // Publish SSE events so timeline updates in real-time
    collabPubSubService.publish(call.channelId, {
      eventId: `evt_msg_${Date.now()}`,
      type: 'message:new',
      channelId: call.channelId,
      senderId: call.hostId,
      data: message,
      timestamp: new Date().toISOString()
    });

    collabPubSubService.publish(call.channelId, {
      eventId: `evt_end_${Date.now()}`,
      type: 'call:end',
      channelId: call.channelId,
      senderId: call.hostId,
      data: {
        callId: call.id,
        channelId: call.channelId,
        type: call.type,
        status: call.status,
        durationSeconds: call.durationSeconds || 0
      },
      timestamp: new Date().toISOString()
    });

    // Notify missed call recipients
    if (call.status === CallStatus.MISSED) {
      const missedRecipients = call.participants.filter((p) => p.userId !== call.hostId && p.status === CallStatus.MISSED);
      for (const r of missedRecipients) {
        notificationService.createNotification({
          userId: r.userId,
          type: NotificationType.CALL_MISSED,
          title: `📞 Missed Call`,
          body: `Missed ${call.type === 'VIDEO' ? 'video' : 'voice'} call from ${call.host.name}`,
          channelId: call.channelId,
          actorUserId: call.hostId
        }).catch(() => {});
      }
    }

    return message;
  }
}

export const callHistoryService = new CallHistoryService();
