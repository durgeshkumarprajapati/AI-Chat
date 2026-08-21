export class VoiceTutorTelemetryService {
  public logEvent(eventName: string, metadata: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    // Exclude sensitive payload data if any
    const safeMeta = { ...metadata };
    delete safeMeta.audioBuffer;
    delete safeMeta.rawTranscript;
    delete safeMeta.textInput;
    delete safeMeta.apiKey;

    console.log(`[VoiceTutorTelemetry] event=${eventName} timestamp=${timestamp} meta=${JSON.stringify(safeMeta)}`);
  }

  public logSessionCreated(sessionId: string, userId: string, mode: string): void {
    this.logEvent('voice_tutor.session.created', { sessionId, userId, mode });
  }

  public logAudioUploaded(sessionId: string, userId: string, audioBytes: number, mimeType: string): void {
    this.logEvent('voice_tutor.audio.uploaded', { sessionId, userId, audioBytes, mimeType });
  }

  public logTranscriptionCompleted(sessionId: string, userId: string, durationMs: number): void {
    this.logEvent('voice_tutor.transcription.completed', { sessionId, userId, durationMs });
  }

  public logLLMCompleted(sessionId: string, userId: string, latencyMs: number, ragUsed: boolean): void {
    this.logEvent('voice_tutor.llm.completed', { sessionId, userId, latencyMs, ragUsed });
  }

  public logTTSCompleted(sessionId: string, userId: string, durationMs: number): void {
    this.logEvent('voice_tutor.tts.completed', { sessionId, userId, durationMs });
  }

  public logSessionCompleted(sessionId: string, userId: string, totalMessages: number): void {
    this.logEvent('voice_tutor.session.completed', { sessionId, userId, totalMessages });
  }

  public logError(sessionId: string, userId: string, stage: string, errorMsg: string): void {
    this.logEvent('voice_tutor.error', { sessionId, userId, stage, errorMsg });
  }
}

export const voiceTutorTelemetryService = new VoiceTutorTelemetryService();
