export interface MeetingTelemetryEvent {
  event: string;
  meetingId?: string;
  userId?: string;
  projectId?: string | null;
  durationMs?: number;
  wordCount?: number;
  taskCount?: number;
  error?: string;
  [key: string]: unknown;
}

export class MeetingIntelligenceTelemetryService {
  public logEvent(event: MeetingTelemetryEvent): void {
    console.log(`[MeetingIntelligenceTelemetry] ${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}`);
  }
}

export const meetingIntelligenceTelemetryService = new MeetingIntelligenceTelemetryService();
