import { voiceTutorRepository } from './voice-tutor.repository';
import { CreateVoiceSessionInput, VoiceTutorSessionDTO } from './voice-tutor.types';
import { SessionNotFoundError, UnauthorizedSessionError } from './voice-tutor.errors';
import { VoiceTutorSessionStatus } from '@prisma/client';

export class VoiceTutorSessionService {
  public async createSession(userId: string, input: CreateVoiceSessionInput): Promise<VoiceTutorSessionDTO> {
    const session = await voiceTutorRepository.createSession({
      userId,
      title: input.title?.trim() || 'AI Voice Tutoring Session',
      mode: input.mode || 'FREE_TUTOR',
      knowledgeBaseId: input.knowledgeBaseId,
      documentId: input.documentId
    });

    return this.toDTO(session);
  }

  public async getSession(sessionId: string, userId: string): Promise<VoiceTutorSessionDTO> {
    const session = await voiceTutorRepository.findSessionById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedSessionError();
    }
    return this.toDTO(session);
  }

  public async listUserSessions(
    userId: string,
    options?: { limit?: number; offset?: number; status?: VoiceTutorSessionStatus }
  ) {
    const { sessions, total } = await voiceTutorRepository.findSessionsByUserId(userId, options);
    return {
      sessions: sessions.map((s) => this.toDTO(s)),
      total
    };
  }

  public async pauseSession(sessionId: string, userId: string): Promise<VoiceTutorSessionDTO> {
    await this.getSession(sessionId, userId);
    const updated = await voiceTutorRepository.updateSessionStatus(sessionId, VoiceTutorSessionStatus.PAUSED);
    const fresh = await voiceTutorRepository.findSessionById(sessionId);
    return this.toDTO(fresh || updated);
  }

  public async resumeSession(sessionId: string, userId: string): Promise<VoiceTutorSessionDTO> {
    await this.getSession(sessionId, userId);
    const updated = await voiceTutorRepository.updateSessionStatus(sessionId, VoiceTutorSessionStatus.ACTIVE);
    const fresh = await voiceTutorRepository.findSessionById(sessionId);
    return this.toDTO(fresh || updated);
  }

  public async completeSession(sessionId: string, userId: string): Promise<VoiceTutorSessionDTO> {
    await this.getSession(sessionId, userId);
    const updated = await voiceTutorRepository.updateSessionStatus(sessionId, VoiceTutorSessionStatus.COMPLETED);
    const fresh = await voiceTutorRepository.findSessionById(sessionId);
    return this.toDTO(fresh || updated);
  }

  public async cancelSession(sessionId: string, userId: string): Promise<boolean> {
    await this.getSession(sessionId, userId);
    return voiceTutorRepository.deleteSession(sessionId, userId);
  }

  public toDTO(session: any): VoiceTutorSessionDTO {
    return {
      id: session.id,
      userId: session.userId,
      title: session.title,
      mode: session.mode,
      status: session.status,
      knowledgeBaseId: session.knowledgeBaseId,
      documentId: session.documentId,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null,
      durationSeconds: session.durationSeconds,
      totalMessages: session.totalMessages,
      messages: (session.messages || []).map((m: any) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        text: m.text,
        audioUrl: m.audioUrl,
        durationMs: m.durationMs,
        ragContext: m.ragContext,
        graphContext: m.graphContext,
        createdAt: new Date(m.createdAt).toISOString()
      })),
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString()
    };
  }
}

export const voiceTutorSessionService = new VoiceTutorSessionService();
