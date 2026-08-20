import { prisma } from '@/lib/prisma';
import { scheduledCallRepository } from './scheduled-call.repository';
import { CreateScheduledCallInput, RescheduleCallInput, ScheduledCallDTO } from './scheduled-call.types';
import { ScheduledCallType, ScheduledCallStatus, CollabMessageType, CalendarSyncStatus } from '@prisma/client';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { calendarIdempotencyService } from '@/features/google-calendar/google-calendar.idempotency';
import { classifyGoogleError } from '@/features/google-calendar/google-calendar.errors';
import { collabPubSubService } from '../pubsub.service';
import { envConfig } from '@/config/env';

export class ScheduledCallService {
  /**
   * Transforms ScheduledCall Prisma model to DTO
   */
  public toDTO(call: any): ScheduledCallDTO {
    return {
      id: call.id,
      channelId: call.channelId,
      createdById: call.createdById,
      title: call.title,
      callType: call.callType,
      status: call.status,
      scheduledStartAt: new Date(call.scheduledStartAt).toISOString(),
      scheduledEndAt: new Date(call.scheduledEndAt).toISOString(),
      durationMinutes: call.durationMinutes,
      timezone: call.timezone,
      googleCalendarEventId: call.googleCalendarEventId,
      googleCalendarEventUrl: call.googleCalendarEventUrl,
      googleMeetUrl: call.googleMeetUrl,
      googleMeetConferenceId: call.googleMeetConferenceId,
      calendarSyncStatus: call.calendarSyncStatus,
      calendarSyncError: call.calendarSyncError,
      calendarSyncErrorCode: call.calendarSyncErrorCode,
      calendarSyncAttempts: call.calendarSyncAttempts,
      lastCalendarSyncAt: call.lastCalendarSyncAt ? new Date(call.lastCalendarSyncAt).toISOString() : null,
      cancelledAt: call.cancelledAt ? new Date(call.cancelledAt).toISOString() : null,
      cancelledById: call.cancelledById,
      createdAt: new Date(call.createdAt).toISOString(),
      updatedAt: new Date(call.updatedAt).toISOString(),
      participants: (call.participants || []).map((p: any) => ({
        id: p.id,
        userId: p.userId,
        email: p.email || p.user?.email || null,
        name: p.user?.name || null,
        avatarUrl: p.user?.avatarUrl || null,
        role: p.role,
        responseStatus: p.responseStatus
      }))
    };
  }

  /**
   * Schedule a new 1-on-1 or Group Google Meet Call
   */
  public async createScheduledCall(userId: string, input: CreateScheduledCallInput): Promise<ScheduledCallDTO> {
    const startTime = new Date(input.scheduledStartAt);
    if (isNaN(startTime.getTime()) || startTime.getTime() <= Date.now() - 60000) {
      throw new Error('Scheduled start time must be in the future');
    }

    const durationMinutes = input.durationMinutes || 30;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    // 1. Validate channel and membership
    const channel = await prisma.collabChannel.findUnique({
      where: { id: input.channelId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    const isMember = channel.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new Error('You are not a member of this channel');
    }

    const callType = channel.type === 'DIRECT' ? ScheduledCallType.ONE_TO_ONE : ScheduledCallType.GROUP;

    // Determine eligible participants
    let eligibleMembers = channel.members;
    if (input.participantUserIds && input.participantUserIds.length > 0) {
      const allowedSet = new Set([...input.participantUserIds, userId]);
      eligibleMembers = channel.members.filter((m) => allowedSet.has(m.userId));
    }

    const participantData = eligibleMembers.map((m) => ({
      userId: m.userId,
      email: m.user.email
    }));

    // 2. Create ScheduledCall record in DB
    const callRecord = await scheduledCallRepository.createScheduledCall({
      channelId: input.channelId,
      createdById: userId,
      title: input.title.trim(),
      callType,
      scheduledStartAt: startTime,
      scheduledEndAt: endTime,
      durationMinutes,
      timezone: input.timezone || 'UTC',
      participantUserIds: participantData
    });

    // 3. Post automated system message in Collab Chat (Idempotent)
    const existingMsg = await prisma.collabMessage.findFirst({
      where: { scheduledCallId: callRecord.id }
    });

    if (!existingMsg) {
      const systemMsg = await prisma.collabMessage.create({
        data: {
          channelId: input.channelId,
          senderId: userId,
          messageType: CollabMessageType.SCHEDULED_CALL,
          scheduledCallId: callRecord.id,
          content: `📹 Scheduled Call: ${input.title.trim()}`
        },
        include: {
          sender: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });

      collabPubSubService.publish(input.channelId, {
        type: 'message:new',
        channelId: input.channelId,
        senderId: userId,
        data: systemMsg,
        timestamp: new Date().toISOString()
      });
    }

    // Publish initial realtime event
    const callDTO = this.toDTO(callRecord);
    collabPubSubService.publish(input.channelId, {
      type: 'scheduled-call:created',
      channelId: input.channelId,
      senderId: userId,
      data: callDTO,
      timestamp: new Date().toISOString()
    });

    // 4. Synchronize with Google Calendar & generate Google Meet link
    try {
      const syncedDTO = await this.synchronizeCallCalendar(callRecord.id, userId);
      return syncedDTO;
    } catch (err) {
      console.error(`[ScheduledCallService] Calendar sync error for call ${callRecord.id}:`, err);
      return callDTO;
    }
  }

  /**
   * Synchronizes a single ScheduledCall record with Google Calendar API
   */
  public async synchronizeCallCalendar(scheduledCallId: string, userId: string): Promise<ScheduledCallDTO> {
    const callRecord = await scheduledCallRepository.findById(scheduledCallId);
    if (!callRecord) {
      throw new Error('Scheduled call not found');
    }

    if (callRecord.status === ScheduledCallStatus.CANCELLED) {
      return this.toDTO(callRecord);
    }

    const claimed = await scheduledCallRepository.claimJobForSync(callRecord.id);
    if (!claimed && callRecord.calendarSyncStatus === CalendarSyncStatus.SYNCING) {
      return this.toDTO(callRecord);
    }

    const attendeeEmails = Array.from(
      new Set(
        callRecord.participants
          .map((p) => p.email || p.user?.email)
          .filter((e): e is string => Boolean(e && e.trim().length > 0))
      )
    );

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const deterministicEventId = calendarIdempotencyService.generateEventId(callRecord.id, userId);

    const eventDetails = {
      scheduledCallId: deterministicEventId,
      title: `📹 Scheduled Call — ${callRecord.title}`,
      description: `Scheduled Google Meet Call from Document AI Platform.\n\nTitle: ${callRecord.title}\nChannel: ${callRecord.channel?.name || 'Collaboration Chat'}\nOrganizer: ${callRecord.createdBy?.name || callRecord.createdBy?.email}\nPlatform Link: ${appBaseUrl}/collab-chat?channel=${callRecord.channelId}`,
      startTime: new Date(callRecord.scheduledStartAt),
      endTime: new Date(callRecord.scheduledEndAt),
      timeZone: callRecord.timezone || 'UTC',
      createConference: true,
      conferenceRequestId: `meet_${deterministicEventId}`
    };

    const apiResult = await googleCalendarService.createCalendarEventViaApi(userId, eventDetails, attendeeEmails);

    let updatedCall: any;
    if (apiResult.success) {
      updatedCall = await scheduledCallRepository.markSynced(
        callRecord.id,
        apiResult.eventId,
        apiResult.htmlLink,
        apiResult.meetUrl,
        apiResult.conferenceId
      );

      const dto = this.toDTO(updatedCall);
      collabPubSubService.publish(callRecord.channelId, {
        type: 'scheduled-call:calendar-synced',
        channelId: callRecord.channelId,
        senderId: userId,
        data: dto,
        timestamp: new Date().toISOString()
      });

      return dto;
    }

    // Handle failure states
    if (apiResult.errorCode === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      updatedCall = await scheduledCallRepository.markNotConnected(callRecord.id, apiResult.error);
    } else {
      const errorInfo = classifyGoogleError(undefined, apiResult.error);
      if (errorInfo.isAuthFailure) {
        updatedCall = await scheduledCallRepository.markReauthRequired(callRecord.id, apiResult.error);
      } else {
        const currentAttempt = callRecord.calendarSyncAttempts + 1;
        const backoffMinutes = [1, 5, 15, 30, 60];
        const maxAttempts = envConfig.google.maxRetries || 5;

        if (errorInfo.isTransient && currentAttempt <= maxAttempts) {
          const delayMinutes = backoffMinutes[Math.min(currentAttempt - 1, backoffMinutes.length - 1)] || 5;
          const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
          updatedCall = await scheduledCallRepository.markSyncFailed(
            callRecord.id,
            errorInfo.errorCode,
            apiResult.error,
            true,
            nextRetryAt
          );
        } else {
          updatedCall = await scheduledCallRepository.markSyncFailed(
            callRecord.id,
            errorInfo.errorCode,
            apiResult.error,
            false,
            null
          );
        }
      }
    }

    const dto = this.toDTO(updatedCall);
    collabPubSubService.publish(callRecord.channelId, {
      type: 'scheduled-call:calendar-failed',
      channelId: callRecord.channelId,
      senderId: userId,
      data: dto,
      timestamp: new Date().toISOString()
    });

    return dto;
  }

  /**
   * Reschedule an existing ScheduledCall
   */
  public async rescheduleCall(userId: string, callId: string, input: RescheduleCallInput): Promise<ScheduledCallDTO> {
    const callRecord = await scheduledCallRepository.findById(callId);
    if (!callRecord) {
      throw new Error('Scheduled call not found');
    }

    if (callRecord.status === ScheduledCallStatus.CANCELLED) {
      throw new Error('Cannot reschedule a cancelled call');
    }

    // Authorization: organizer or channel owner
    const channel = await prisma.collabChannel.findUnique({
      where: { id: callRecord.channelId },
      include: { members: true }
    });

    const isOrganizer = callRecord.createdById === userId;
    const userMember = channel?.members.find((m) => m.userId === userId);
    const isOwner = userMember?.role === 'OWNER';

    if (!isOrganizer && !isOwner) {
      throw new Error('Only the organizer or channel owner can reschedule this call');
    }

    const newStart = new Date(input.scheduledStartAt);
    if (isNaN(newStart.getTime()) || newStart.getTime() <= Date.now() - 60000) {
      throw new Error('New start time must be in the future');
    }

    const duration = input.durationMinutes || callRecord.durationMinutes;
    const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);

    const updated = await scheduledCallRepository.rescheduleCall(callId, {
      title: input.title,
      scheduledStartAt: newStart,
      scheduledEndAt: newEnd,
      durationMinutes: duration,
      timezone: input.timezone
    });

    // Update Google Calendar event if it exists
    if (callRecord.googleCalendarEventId) {
      const attendeeEmails = Array.from(
        new Set(
          callRecord.participants
            .map((p) => p.email || p.user?.email)
            .filter((e): e is string => Boolean(e && e.trim().length > 0))
        )
      );

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
      const eventDetails = {
        scheduledCallId: callRecord.id,
        title: `📹 Scheduled Call — ${updated.title}`,
        description: `Scheduled Google Meet Call from Document AI Platform.\n\nTitle: ${updated.title}\nChannel: ${callRecord.channel?.name || 'Collaboration Chat'}\nOrganizer: ${callRecord.createdBy?.name || callRecord.createdBy?.email}\nPlatform Link: ${appBaseUrl}/collab-chat?channel=${callRecord.channelId}`,
        startTime: newStart,
        endTime: newEnd,
        timeZone: updated.timezone || 'UTC',
        createConference: true
      };

      const updateRes = await googleCalendarService.updateCalendarEventViaApi(
        callRecord.createdById,
        callRecord.googleCalendarEventId,
        eventDetails,
        attendeeEmails
      );

      if (updateRes.success) {
        await scheduledCallRepository.markSynced(
          callId,
          updateRes.eventId,
          updateRes.htmlLink,
          updateRes.meetUrl || callRecord.googleMeetUrl || undefined,
          updateRes.conferenceId || callRecord.googleMeetConferenceId || undefined
        );
      }
    }

    const fresh = await scheduledCallRepository.findById(callId);
    const dto = this.toDTO(fresh);

    collabPubSubService.publish(callRecord.channelId, {
      type: 'scheduled-call:updated',
      channelId: callRecord.channelId,
      senderId: userId,
      data: dto,
      timestamp: new Date().toISOString()
    });

    return dto;
  }

  /**
   * Cancel an existing ScheduledCall
   */
  public async cancelCall(userId: string, callId: string): Promise<ScheduledCallDTO> {
    const callRecord = await scheduledCallRepository.findById(callId);
    if (!callRecord) {
      throw new Error('Scheduled call not found');
    }

    if (callRecord.status === ScheduledCallStatus.CANCELLED) {
      return this.toDTO(callRecord);
    }

    // Authorization: organizer or channel owner
    const channel = await prisma.collabChannel.findUnique({
      where: { id: callRecord.channelId },
      include: { members: true }
    });

    const isOrganizer = callRecord.createdById === userId;
    const userMember = channel?.members.find((m) => m.userId === userId);
    const isOwner = userMember?.role === 'OWNER';

    if (!isOrganizer && !isOwner) {
      throw new Error('Only the organizer or channel owner can cancel this call');
    }

    const cancelled = await scheduledCallRepository.cancelCall(callId, userId);

    // Delete/cancel Google Calendar event
    if (callRecord.googleCalendarEventId) {
      googleCalendarService
        .deleteCalendarEventViaApi(callRecord.createdById, callRecord.googleCalendarEventId)
        .catch((err) => {
          console.warn(`[ScheduledCallService] Failed to delete Google Calendar event ${callRecord.googleCalendarEventId}:`, err);
        });
    }

    const dto = this.toDTO(cancelled);

    collabPubSubService.publish(callRecord.channelId, {
      type: 'scheduled-call:cancelled',
      channelId: callRecord.channelId,
      senderId: userId,
      data: dto,
      timestamp: new Date().toISOString()
    });

    return dto;
  }

  /**
   * Get active scheduled calls for a channel
   */
  public async getChannelScheduledCalls(userId: string, channelId: string): Promise<ScheduledCallDTO[]> {
    const isMember = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });

    if (!isMember) {
      throw new Error('Access denied to channel calls');
    }

    const calls = await scheduledCallRepository.findActiveByChannelId(channelId);
    return calls.map((c) => this.toDTO(c));
  }

  /**
   * Get single scheduled call details with authorization
   */
  public async getScheduledCallDetails(userId: string, callId: string): Promise<ScheduledCallDTO> {
    const call = await scheduledCallRepository.findById(callId);
    if (!call) {
      throw new Error('Scheduled call not found');
    }

    const isMember = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId: call.channelId, userId } }
    });

    if (!isMember) {
      throw new Error('Access denied');
    }

    return this.toDTO(call);
  }
}

export const scheduledCallService = new ScheduledCallService();
