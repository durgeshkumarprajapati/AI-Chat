import { chillFocusRepository } from './chill-focus.repository';
import { chillFocusStreakService } from './chill-focus.streak.service';
import { chillFocusTelemetryService } from './chill-focus.telemetry.service';
import { ChillFocusSessionDTO, CreateChillFocusSessionInput } from './chill-focus.types';
import { InvalidStateTransitionError, SessionNotFoundError, UnauthorizedSessionError } from './chill-focus.errors';
import { ChillFocusMode, ChillFocusStatus } from '@prisma/client';

export class ChillFocusSessionService {
  /**
   * Creates a new Chill or Focus session. If an ACTIVE session exists, returns it or completes it safely.
   */
  public async createSession(userId: string, input: CreateChillFocusSessionInput): Promise<ChillFocusSessionDTO> {
    const existing = await chillFocusRepository.findActiveSession(userId);
    if (existing) {
      // Auto-complete or return active session to prevent duplicate active sessions
      return this.toDTO(existing);
    }

    const session = await chillFocusRepository.createSession({
      userId,
      mode: (input.mode as ChillFocusMode) || ChillFocusMode.CHILL,
      plannedDurationSeconds: input.plannedDurationSeconds || 300,
      soundscape: input.soundscape || 'night_sky'
    });

    chillFocusTelemetryService.logSessionCreated(session.id, userId, session.mode, session.soundscape);
    return this.toDTO(session);
  }

  public async getSession(sessionId: string, userId: string): Promise<ChillFocusSessionDTO> {
    const session = await chillFocusRepository.findSessionById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedSessionError();
    }

    // Check lazy expiration
    const maxMinutes = 120;
    const elapsedSeconds = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    if (session.status === ChillFocusStatus.ACTIVE && elapsedSeconds > maxMinutes * 60) {
      const expired = await chillFocusRepository.updateSession(session.id, {
        status: ChillFocusStatus.EXPIRED,
        completedAt: new Date()
      });
      return this.toDTO(expired || session);
    }

    return this.toDTO(session);
  }

  public async pauseSession(sessionId: string, userId: string): Promise<ChillFocusSessionDTO> {
    const session = await chillFocusRepository.findSessionById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.userId !== userId) throw new UnauthorizedSessionError();

    if (session.status !== ChillFocusStatus.ACTIVE) {
      throw new InvalidStateTransitionError(session.status, ChillFocusStatus.PAUSED);
    }

    const now = new Date();
    const lastStart = session.resumedAt || session.startedAt;
    const intervalSec = Math.max(0, Math.round((now.getTime() - new Date(lastStart).getTime()) / 1000));
    const newActiveDuration = session.activeDurationSeconds + intervalSec;

    const updated = await chillFocusRepository.updateSession(sessionId, {
      status: ChillFocusStatus.PAUSED,
      pausedAt: now,
      activeDurationSeconds: newActiveDuration
    });

    chillFocusTelemetryService.logSessionPaused(sessionId, userId, newActiveDuration);
    return this.toDTO(updated || session);
  }

  public async resumeSession(sessionId: string, userId: string): Promise<ChillFocusSessionDTO> {
    const session = await chillFocusRepository.findSessionById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.userId !== userId) throw new UnauthorizedSessionError();

    if (session.status !== ChillFocusStatus.PAUSED) {
      throw new InvalidStateTransitionError(session.status, ChillFocusStatus.ACTIVE);
    }

    const now = new Date();
    const updated = await chillFocusRepository.updateSession(sessionId, {
      status: ChillFocusStatus.ACTIVE,
      resumedAt: now
    });

    chillFocusTelemetryService.logSessionResumed(sessionId, userId);
    return this.toDTO(updated || session);
  }

  public async completeSession(sessionId: string, userId: string): Promise<ChillFocusSessionDTO> {
    const session = await chillFocusRepository.findSessionById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.userId !== userId) throw new UnauthorizedSessionError();

    if (session.status !== ChillFocusStatus.ACTIVE && session.status !== ChillFocusStatus.PAUSED) {
      throw new InvalidStateTransitionError(session.status, ChillFocusStatus.COMPLETED);
    }

    const now = new Date();
    let finalActiveDuration = session.activeDurationSeconds;

    if (session.status === ChillFocusStatus.ACTIVE) {
      const lastStart = session.resumedAt || session.startedAt;
      const intervalSec = Math.max(0, Math.round((now.getTime() - new Date(lastStart).getTime()) / 1000));
      finalActiveDuration += intervalSec;
    }

    const updated = await chillFocusRepository.updateSession(sessionId, {
      status: ChillFocusStatus.COMPLETED,
      completedAt: now,
      activeDurationSeconds: finalActiveDuration
    });

    // Record Calm Streak credit server-side
    await chillFocusStreakService.recordCompletedSession(userId, finalActiveDuration);
    chillFocusTelemetryService.logSessionCompleted(sessionId, userId, finalActiveDuration);

    return this.toDTO(updated || session);
  }

  public async cancelSession(sessionId: string, userId: string): Promise<ChillFocusSessionDTO> {
    const session = await chillFocusRepository.findSessionById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.userId !== userId) throw new UnauthorizedSessionError();

    if (session.status === ChillFocusStatus.COMPLETED || session.status === ChillFocusStatus.CANCELLED) {
      throw new InvalidStateTransitionError(session.status, ChillFocusStatus.CANCELLED);
    }

    const updated = await chillFocusRepository.updateSession(sessionId, {
      status: ChillFocusStatus.CANCELLED,
      completedAt: new Date()
    });

    chillFocusTelemetryService.logSessionCancelled(sessionId, userId);
    return this.toDTO(updated || session);
  }

  public toDTO(session: any): ChillFocusSessionDTO {
    return {
      id: session.id,
      userId: session.userId,
      mode: session.mode,
      status: session.status,
      startedAt: new Date(session.startedAt).toISOString(),
      pausedAt: session.pausedAt ? new Date(session.pausedAt).toISOString() : null,
      resumedAt: session.resumedAt ? new Date(session.resumedAt).toISOString() : null,
      completedAt: session.completedAt ? new Date(session.completedAt).toISOString() : null,
      plannedDurationSeconds: session.plannedDurationSeconds,
      activeDurationSeconds: session.activeDurationSeconds,
      soundscape: session.soundscape,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString()
    };
  }
}

export const chillFocusSessionService = new ChillFocusSessionService();
