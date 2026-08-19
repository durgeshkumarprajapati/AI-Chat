export class TelemetryService {
  public logEvent(
    eventName: string,
    data: {
      channelId?: string;
      messageId?: string;
      notificationId?: string;
      eventId?: string;
      userId?: string;
      status?: string;
      latencyMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): void {
    // Structured JSON log excluding sensitive payload/passwords/auth tokens
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: eventName,
      ...data
    };

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Telemetry] ${JSON.stringify(logEntry)}`);
    }
  }
}

export const telemetryService = new TelemetryService();
