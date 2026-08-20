import { MockTestStatus } from '@prisma/client';

export type LibraryFilterStatus = 'ALL' | 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'EXPIRED' | 'SHARED';

export interface MockTestLibraryQueryFilters {
  page?: number;
  limit?: number;
  status?: LibraryFilterStatus;
  search?: string;
  topic?: string;
  createdBy?: string;
}

export interface MockTestLibraryCardDTO {
  id: string;
  createdById: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  title: string;
  description?: string | null;
  topic?: string | null;
  scheduledStartTime: Date;
  durationMinutes: number;
  totalQuestions: number;
  status: MockTestStatus;
  googleCalendarLink?: string | null;
  participantCount: number;
  userParticipantStatus?: string | null;
  userScore?: number | null;
  userPassed?: boolean | null;
  createdAt: Date;
}

export interface PaginatedLibraryResponse {
  data: MockTestLibraryCardDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
