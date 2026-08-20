export interface CityExplorerTelemetryEvent {
  event:
    | 'city_explorer.prefetch.started'
    | 'city_explorer.prefetch.completed'
    | 'city_explorer.answer.started'
    | 'city_explorer.answer.cache_hit'
    | 'city_explorer.answer.cache_miss'
    | 'city_explorer.answer.generated'
    | 'city_explorer.answer.failed'
    | 'city_explorer.answer.no_evidence'
    | 'city_explorer.answer.refreshed'
    | 'city_explorer.answer.fallback_used'
    | 'city_explorer.provider.selected'
    | 'city_explorer.provider.success'
    | 'city_explorer.provider.timeout'
    | 'city_explorer.provider.failure'
    | 'city_explorer.source.failed'
    | 'city_explorer.stream.started'
    | 'city_explorer.stream.answer_sent'
    | 'city_explorer.stream.partial'
    | 'city_explorer.stream.completed'
    | 'city_explorer.stream.timeout'
    | 'city_explorer.architecture_violation'
    | 'city_explorer.prefetch.cancelled'
    | 'explore.ai.request.started'
    | 'explore.ai.cache.hit'
    | 'explore.ai.cache.miss'
    | 'explore.ai.generation.started'
    | 'explore.ai.generation.completed'
    | 'explore.ai.generation.failed'
    | 'explore.ai.validation.failed'
    | 'explore.ai.retry'
    | 'explore.ai.fallback'
    | 'explore.ai.answer.refreshed';
  userId?: string;
  city: string;
  questionId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class CityExplorerTelemetryService {
  private logs: CityExplorerTelemetryEvent[] = [];
  private readonly maxLogs = 500;

  public logEvent(
    event: CityExplorerTelemetryEvent['event'],
    city: string,
    questionId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const entry: CityExplorerTelemetryEvent = {
      event,
      city,
      questionId,
      userId,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[CityExplorerTelemetry] event=${event} city=${city} questionId=${questionId || 'all'}`, metadata || {});
    }
  }

  public getRecentLogs(city?: string): CityExplorerTelemetryEvent[] {
    if (city) {
      return this.logs.filter((l) => l.city.toLowerCase() === city.toLowerCase());
    }
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const cityExplorerTelemetryService = new CityExplorerTelemetryService();
