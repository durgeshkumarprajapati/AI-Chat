import { TourTelemetryEvent } from './tour-types';

export class TourAnalyticsService {
  private logs: TourTelemetryEvent[] = [];
  private readonly maxLogs = 500;

  public logEvent(
    event: TourTelemetryEvent['event'],
    tourId: string,
    tourVersion: number,
    stepId?: string,
    stepIndex?: number,
    target?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const entry: TourTelemetryEvent = {
      event,
      tourId,
      tourVersion,
      stepId,
      stepIndex,
      target,
      userId,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[TourTelemetry] event=${event} tourId=${tourId} v=${tourVersion} step=${stepId || 'all'}`, metadata || {});
    }
  }

  public getRecentLogs(tourId?: string): TourTelemetryEvent[] {
    if (tourId) {
      return this.logs.filter((l) => l.tourId.toLowerCase() === tourId.toLowerCase());
    }
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const tourAnalyticsService = new TourAnalyticsService();
