import { MeetingStatus, MeetingSourceProvider, TaskSuggestionStatus } from '@prisma/client';

export interface CreateMeetingInput {
  userId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  meetingDate?: Date | string;
  sourceProvider?: MeetingSourceProvider;
  participants?: Array<{ name: string; email?: string; role?: string }>;
}

export interface IngestTranscriptInput {
  meetingId: string;
  userId: string;
  rawContent: string;
  language?: string;
}

export interface MeetingAnalysisResultDTO {
  summary: string;
  discussionPoints: string[];
  decisions: string[];
  actionItems: Array<{
    title: string;
    description?: string;
    suggestedAssignee?: string;
    suggestedDueDate?: string | null;
    confidence?: number;
  }>;
  risks: string[];
  blockers: string[];
  openQuestions: string[];
  confidence: number;
}

export interface MeetingDetailDTO {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  meetingDate: Date;
  sourceProvider: MeetingSourceProvider;
  status: MeetingStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: Array<{ id: string; name: string; email: string | null; role: string | null }>;
  transcript?: { id: string; rawContent: string; normalizedContent: string; wordCount: number; language: string } | null;
  analysis?: MeetingAnalysisResultDTO | null;
  taskSuggestions: Array<{
    id: string;
    title: string;
    description: string | null;
    suggestedAssignee: string | null;
    suggestedDueDate: Date | null;
    confidence: number;
    status: TaskSuggestionStatus;
    clickUpTaskId: string | null;
    clickUpUrl: string | null;
  }>;
}
