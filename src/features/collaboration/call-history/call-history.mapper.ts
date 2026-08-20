import { CallHistoryItemDTO, CallOutcomeType, CallParticipantDTO } from './call-history.types';
import { CallStatus } from '@prisma/client';

export class CallHistoryMapper {
  /**
   * Formats raw durationSeconds into human readable string
   */
  public formatDuration(durationSeconds: number, status: CallStatus): string {
    if (status === CallStatus.MISSED) return 'Missed';
    if (status === CallStatus.DECLINED) return 'Declined';
    if (status === CallStatus.CANCELLED) return 'Cancelled';

    if (durationSeconds <= 0) return '0 sec';
    const hrs = Math.floor(durationSeconds / 3600);
    const mins = Math.floor((durationSeconds % 3600) / 60);
    const secs = durationSeconds % 60;

    if (hrs > 0) return `${hrs} hr ${mins} min`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  }

  /**
   * Maps raw Prisma CallSession to CallHistoryItemDTO
   */
  public mapToDTO(callSession: any): CallHistoryItemDTO {
    const start = callSession.startedAt || callSession.createdAt;
    const end = callSession.endedAt;

    let durationSeconds = callSession.durationSeconds || 0;
    if (!durationSeconds && start && end) {
      durationSeconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    }

    let outcome: CallOutcomeType = 'COMPLETED';
    if (callSession.status === CallStatus.MISSED) outcome = 'MISSED';
    else if (callSession.status === CallStatus.DECLINED) outcome = 'DECLINED';
    else if (callSession.status === CallStatus.CANCELLED) outcome = 'CANCELLED';

    const participants: CallParticipantDTO[] = (callSession.participants || []).map((p: any) => ({
      userId: p.userId,
      name: p.user?.name || 'User',
      email: p.user?.email || '',
      avatarUrl: p.user?.avatarUrl || null,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      isMuted: p.isMuted,
      isVideoOff: p.isVideoOff
    }));

    const isGroup = (callSession.channel?.type === 'GROUP') || (participants.length > 2);

    return {
      id: callSession.id,
      channelId: callSession.channelId,
      channelName: callSession.channel?.name || null,
      isGroup,
      hostId: callSession.hostId,
      hostName: callSession.host?.name || 'Host',
      hostAvatarUrl: callSession.host?.avatarUrl || null,
      type: callSession.type,
      status: callSession.status,
      outcome,
      startedAt: callSession.startedAt,
      endedAt: callSession.endedAt,
      durationSeconds,
      formattedDuration: this.formatDuration(durationSeconds, callSession.status),
      createdAt: callSession.createdAt,
      participants,
      participantCount: participants.length
    };
  }
}

export const callHistoryMapper = new CallHistoryMapper();
