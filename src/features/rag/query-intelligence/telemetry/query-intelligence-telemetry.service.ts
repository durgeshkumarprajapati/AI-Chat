import { QueryIntent, RoutingConfidence } from '../query-intelligence.types';

export interface QueryIntelligenceTelemetryEvent {
  event: 'rag.query.analyzed' | 'rag.routing.completed' | 'rag.strategy.selected' | 'rag.dynamic_topk.selected';
  userId?: string;
  question?: string; // truncated to ~60 chars to avoid excessive log bloat
  intent?: QueryIntent;
  routingConfidence?: RoutingConfidence;
  strategy?: string;
  candidateK?: number;
  finalK?: number;
  durationMs?: number;
  source?: 'heuristic' | 'heuristic+llm' | 'heuristic-fallback';
}

// In-memory bounded array, mirrors knowledge-graph-telemetry.service.ts's established pattern —
// no APM/metrics backend exists in this repo to integrate with.
export class QueryIntelligenceTelemetryService {
  private events: QueryIntelligenceTelemetryEvent[] = [];

  public logEvent(event: QueryIntelligenceTelemetryEvent): void {
    this.events.push({ ...event, question: event.question?.slice(0, 60) });
    if (this.events.length > 500) this.events.shift();
  }

  public getDiagnostics() {
    return { recentEvents: this.events.slice(-20) };
  }
}

export const queryIntelligenceTelemetryService = new QueryIntelligenceTelemetryService();
