export type StudyTelemetryEventType =
  | 'study.question.generated'
  | 'study.question.rejected'
  | 'study.question.duplicate'
  | 'study.question.grounding_failed'
  | 'study.answer.submitted'
  | 'study.answer.evaluated'
  | 'study.topic.completed'
  | 'study.mode.changed'
  | 'study.session.completed';

export interface StudyTelemetryLog {
  event: StudyTelemetryEventType;
  userId: string;
  sessionId: string;
  topicId?: string;
  questionId?: string;
  mode?: string;
  metrics?: Record<string, number | string | boolean>;
  timestamp: string;
}

export class StudyTelemetryService {
  private logs: StudyTelemetryLog[] = [];

  public logEvent(
    event: StudyTelemetryEventType,
    userId: string,
    sessionId: string,
    payload: {
      topicId?: string;
      questionId?: string;
      mode?: string;
      metrics?: Record<string, number | string | boolean>;
    } = {}
  ): void {
    const entry: StudyTelemetryLog = {
      event,
      userId,
      sessionId,
      topicId: payload.topicId,
      questionId: payload.questionId,
      mode: payload.mode,
      metrics: payload.metrics,
      timestamp: new Date().toISOString()
    };

    this.logs.push(entry);

    // Keep in-memory buffer capped at 500 recent events
    if (this.logs.length > 500) {
      this.logs.shift();
    }

    console.log(`[StudyTelemetry] event=${event} userId=${userId} sessionId=${sessionId} metrics=${JSON.stringify(payload.metrics || {})}`);
  }

  public getRecentLogs(userId?: string): StudyTelemetryLog[] {
    if (userId) {
      return this.logs.filter((l) => l.userId === userId);
    }
    return this.logs;
  }
}

export const studyTelemetryService = new StudyTelemetryService();
