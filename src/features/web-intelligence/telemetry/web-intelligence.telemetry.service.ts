export interface WebIntelligenceTelemetryEvent {
  event:
    | 'web.search.started'
    | 'web.search.completed'
    | 'web.search.failed'
    | 'web.crawl.started'
    | 'web.crawl.completed'
    | 'web.crawl.blocked'
    | 'web.cache.hit'
    | 'web.cache.miss'
    | 'web.integration.triggered'
    | 'web.integration.skipped';
  provider: string;
  queryLength?: number;
  durationMs?: number;
  resultCount?: number;
  cached?: boolean;
  reason?: string;
}

export class WebIntelligenceTelemetryService {
  public logEvent(event: WebIntelligenceTelemetryEvent): void {
    console.log(
      `[WebIntelligenceTelemetry] event=${event.event} timestamp=${new Date().toISOString()} meta=${JSON.stringify(
        event
      )}`
    );
  }
}

export const webIntelligenceTelemetryService = new WebIntelligenceTelemetryService();
