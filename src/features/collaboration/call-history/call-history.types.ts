import { CallType, CallStatus } from '@prisma/client';

export type CallOutcomeType = 'COMPLETED' | 'MISSED' | 'DECLINED' | 'CANCELLED' | 'FAILED';

export interface CallHistoryQueryFilters {
  page?: number;
  limit?: number;
  type?: CallType;
  status?: CallOutcomeType;
  channelId?: string;
  from?: Date | string;
  to?: Date | string;
}

export interface CallParticipantDTO {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: CallStatus;
  joinedAt?: Date | null;
  leftAt?: Date | null;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export interface CallHistoryItemDTO {
  id: string;
  channelId: string;
  channelName?: string | null;
  isGroup: boolean;
  hostId: string;
  hostName: string;
  hostAvatarUrl?: string | null;
  type: CallType;
  status: CallStatus;
  outcome: CallOutcomeType;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationSeconds: number;
  formattedDuration: string;
  createdAt: Date;
  participants: CallParticipantDTO[];
  participantCount: number;
}

export interface PaginatedCallHistoryResponse {
  data: CallHistoryItemDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
