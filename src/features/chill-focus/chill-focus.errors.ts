export class ChillFocusError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string = 'CHILL_FOCUS_ERROR',
    statusCode: number = 400
  ) {
    super(message);
    this.name = 'ChillFocusError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class SessionNotFoundError extends ChillFocusError {
  constructor(sessionId: string) {
    super(`Chill & Focus session not found: ${sessionId}`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

export class UnauthorizedSessionError extends ChillFocusError {
  constructor() {
    super('Unauthorized access to Chill & Focus session', 'UNAUTHORIZED_SESSION_ACCESS', 403);
    this.name = 'UnauthorizedSessionError';
  }
}

export class InvalidStateTransitionError extends ChillFocusError {
  constructor(fromStatus: string, toStatus: string) {
    super(`Invalid session status transition from ${fromStatus} to ${toStatus}`, 'INVALID_STATE_TRANSITION', 400);
    this.name = 'InvalidStateTransitionError';
  }
}

export class InvalidSoundscapeError extends ChillFocusError {
  constructor(soundscapeId: string) {
    super(`Invalid soundscape identifier: ${soundscapeId}`, 'INVALID_SOUNDSCAPE', 400);
    this.name = 'InvalidSoundscapeError';
  }
}
