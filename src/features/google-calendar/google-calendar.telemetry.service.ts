export class GoogleCalendarTelemetryService {
  public logSyncStarted(mockTestId: string, userId: string, attempt: number) {
    console.log(`[Telemetry] calendar.sync.started mockTestId="${mockTestId}" userId="${userId}" attempt=${attempt}`);
  }

  public logSyncSuccess(mockTestId: string, userId: string, eventId: string, durationMs: number) {
    console.log(`[Telemetry] calendar.sync.success mockTestId="${mockTestId}" userId="${userId}" eventId="${eventId}" durationMs=${durationMs}`);
  }

  public logSyncFailed(mockTestId: string, userId: string, errorCode: string, message: string) {
    console.warn(`[Telemetry] calendar.sync.failed mockTestId="${mockTestId}" userId="${userId}" errorCode="${errorCode}" message="${message}"`);
  }

  public logSyncRetryScheduled(mockTestId: string, userId: string, attempt: number, nextRetryAt: Date) {
    console.log(`[Telemetry] calendar.sync.retry mockTestId="${mockTestId}" userId="${userId}" attempt=${attempt} nextRetryAt="${nextRetryAt.toISOString()}"`);
  }

  public logReauthRequired(mockTestId: string, userId: string, reason: string) {
    console.warn(`[Telemetry] calendar.sync.reauth_required mockTestId="${mockTestId}" userId="${userId}" reason="${reason}"`);
  }

  public logEventCreated(mockTestId: string, eventId: string, htmlLink: string) {
    console.log(`[Telemetry] calendar.event.created mockTestId="${mockTestId}" eventId="${eventId}" htmlLink="${htmlLink}"`);
  }

  public logEventUpdated(mockTestId: string, eventId: string) {
    console.log(`[Telemetry] calendar.event.updated mockTestId="${mockTestId}" eventId="${eventId}"`);
  }

  public logEventDeleted(mockTestId: string, eventId: string) {
    console.log(`[Telemetry] calendar.event.deleted mockTestId="${mockTestId}" eventId="${eventId}"`);
  }

  public logAttendeesUpdated(mockTestId: string, eventId: string, count: number) {
    console.log(`[Telemetry] calendar.attendees.updated mockTestId="${mockTestId}" eventId="${eventId}" count=${count}`);
  }
}

export const calendarTelemetryService = new GoogleCalendarTelemetryService();
