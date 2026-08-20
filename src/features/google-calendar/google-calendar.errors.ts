export class GoogleCalendarError extends Error {
  public readonly errorCode: string;
  public readonly httpStatus?: number;
  public readonly isTransient: boolean;

  constructor(message: string, errorCode: string, httpStatus?: number, isTransient = false) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
    this.isTransient = isTransient;
  }
}

export function classifyGoogleError(httpStatus?: number, errorMessage?: string): { errorCode: string; isTransient: boolean; isAuthFailure: boolean } {
  const msg = errorMessage?.toLowerCase() || '';

  if (msg.includes('invalid_grant') || msg.includes('revoked') || httpStatus === 401) {
    return { errorCode: 'GOOGLE_REAUTH_REQUIRED', isTransient: false, isAuthFailure: true };
  }

  if (httpStatus === 403 || msg.includes('scope_required') || msg.includes('permission_denied')) {
    return { errorCode: 'GOOGLE_CALENDAR_PERMISSION_DENIED', isTransient: false, isAuthFailure: true };
  }

  if (httpStatus === 400 || msg.includes('invalid_event')) {
    return { errorCode: 'GOOGLE_CALENDAR_INVALID_EVENT', isTransient: false, isAuthFailure: false };
  }

  if (httpStatus === 404) {
    return { errorCode: 'GOOGLE_CALENDAR_NOT_FOUND', isTransient: false, isAuthFailure: false };
  }

  if (httpStatus === 429) {
    return { errorCode: 'GOOGLE_CALENDAR_RATE_LIMITED', isTransient: true, isAuthFailure: false };
  }

  if (httpStatus && httpStatus >= 500) {
    return { errorCode: 'GOOGLE_CALENDAR_TEMPORARY_FAILURE', isTransient: true, isAuthFailure: false };
  }

  if (msg.includes('timeout') || msg.includes('fetch failed') || msg.includes('econnrefused')) {
    return { errorCode: 'GOOGLE_CALENDAR_TEMPORARY_FAILURE', isTransient: true, isAuthFailure: false };
  }

  return { errorCode: 'GOOGLE_CALENDAR_UNKNOWN_ERROR', isTransient: false, isAuthFailure: false };
}
