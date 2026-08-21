import { VoiceTutorSessionMode, VoiceTutorSessionStatus, VoiceTutorRole } from '@prisma/client';

export type VoiceState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'THINKING'
  | 'SPEAKING'
  | 'PAUSED'
  | 'ERROR'
  | 'ENDED';

export interface CreateVoiceSessionInput {
  title?: string;
  mode?: VoiceTutorSessionMode;
  knowledgeBaseId?: string;
  documentId?: string;
}

export interface VoiceTutorMessageDTO {
  id: string;
  sessionId: string;
  role: VoiceTutorRole;
  text: string;
  audioUrl?: string | null;
  durationMs?: number | null;
  ragContext?: any;
  graphContext?: any;
  createdAt: string;
}

export interface VoiceTutorSessionDTO {
  id: string;
  userId: string;
  title: string;
  mode: VoiceTutorSessionMode;
  status: VoiceTutorSessionStatus;
  knowledgeBaseId?: string | null;
  documentId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  totalMessages: number;
  messages?: VoiceTutorMessageDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface STTTranscribeOptions {
  language?: string;
  clientRequestId?: string;
}

export interface STTTranscribeResult {
  text: string;
  durationMs: number;
  confidence?: number;
  language?: string;
}

export interface TTSSynthesizeOptions {
  voice?: string;
  speed?: number;
  clientRequestId?: string;
}

export interface TTSSynthesizeResult {
  audioBuffer: Buffer;
  mimeType: string;
  durationMs: number;
  audioUrl?: string;
}

export interface VoiceTutorPipelineInput {
  sessionId: string;
  userId: string;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  textInput?: string;
  clientRequestId?: string;
}

export interface VoiceTutorPipelineResult {
  sessionId: string;
  userMessage: VoiceTutorMessageDTO;
  tutorMessage: VoiceTutorMessageDTO;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  audioUrl?: string;
  ragContextUsed: boolean;
  graphContextUsed: boolean;
}

export interface VoiceTutorFeedbackDTO {
  id: string;
  sessionId: string;
  userId: string;
  topic: string;
  durationMinutes: number;
  conceptsDiscussed: string[];
  strengths: string[];
  weaknesses: string[];
  recommendedTopics: string[];
  understandingScore: number;
  communicationScore: number;
  recommendedMockTestTopic?: string | null;
  createdAt: string;
}
