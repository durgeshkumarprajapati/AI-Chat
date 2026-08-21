export class ChillFocusTelemetryService {
  public logEvent(eventName: string, metadata: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.log(`[ChillFocusTelemetry] event=${eventName} timestamp=${timestamp} meta=${JSON.stringify(metadata)}`);
  }

  public logSessionCreated(sessionId: string, userId: string, mode: string, soundscape: string): void {
    this.logEvent('chill_focus.session.created', { sessionId, userId, mode, soundscape });
  }

  public logSessionPaused(sessionId: string, userId: string, activeDurationSeconds: number): void {
    this.logEvent('chill_focus.session.paused', { sessionId, userId, activeDurationSeconds });
  }

  public logSessionResumed(sessionId: string, userId: string): void {
    this.logEvent('chill_focus.session.resumed', { sessionId, userId });
  }

  public logSessionCompleted(sessionId: string, userId: string, activeDurationSeconds: number): void {
    this.logEvent('chill_focus.session.completed', { sessionId, userId, activeDurationSeconds });
  }

  public logSessionCancelled(sessionId: string, userId: string): void {
    this.logEvent('chill_focus.session.cancelled', { sessionId, userId });
  }

  public logSoundscapeSelected(userId: string, soundscapeId: string): void {
    this.logEvent('chill_focus.soundscape.selected', { userId, soundscapeId });
  }

  public logSoundscapeFailed(userId: string, soundscapeId: string, errorMsg: string): void {
    this.logEvent('chill_focus.soundscape.failed', { userId, soundscapeId, errorMsg });
  }

  public logStreakEarned(userId: string, streakDays: number): void {
    this.logEvent('chill_focus.streak.earned', { userId, streakDays });
  }

  public logAIIntervention(userId: string, source: 'ai' | 'fallback'): void {
    this.logEvent(source === 'ai' ? 'chill_focus.ai.intervention.generated' : 'chill_focus.ai.intervention.fallback', { userId });
  }
}

export const chillFocusTelemetryService = new ChillFocusTelemetryService();
