export class VoiceTutorError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string = 'VOICE_TUTOR_ERROR',
    statusCode: number = 400
  ) {
    super(message);
    this.name = 'VoiceTutorError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AudioValidationError extends VoiceTutorError {
  constructor(message: string) {
    super(message, 'AUDIO_VALIDATION_ERROR', 400);
    this.name = 'AudioValidationError';
  }
}

export class SessionNotFoundError extends VoiceTutorError {
  constructor(sessionId: string) {
    super(`Voice tutor session not found: ${sessionId}`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

export class UnauthorizedSessionError extends VoiceTutorError {
  constructor() {
    super('Unauthorized access to voice tutor session', 'UNAUTHORIZED_SESSION_ACCESS', 403);
    this.name = 'UnauthorizedSessionError';
  }
}

export class STTError extends VoiceTutorError {
  constructor(message: string) {
    super(`Speech-to-text failed: ${message}`, 'STT_FAILURE', 500);
    this.name = 'STTError';
  }
}

export class TTSError extends VoiceTutorError {
  constructor(message: string) {
    super(`Text-to-speech failed: ${message}`, 'TTS_FAILURE', 500);
    this.name = 'TTSError';
  }
}

export class VoiceTutorRateLimitError extends VoiceTutorError {
  constructor(retryAfterSeconds: number = 60) {
    super(`Rate limit exceeded for voice tutor. Please retry in ${retryAfterSeconds} seconds.`, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'VoiceTutorRateLimitError';
  }
}
