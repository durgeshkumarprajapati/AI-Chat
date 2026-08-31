/**
 * Mirrors `KnowledgeGraphTelemetryService`'s shape exactly (small in-memory ring-buffer +
 * console.log), with the Explorer's own event names. Never log document contents, full evidence
 * snippets, API keys, or secrets here — node/relationship IDs, counts, and latency numbers only.
 */
export interface KgExplorerTelemetryEvent {
  event:
    | 'kg.explorer.query.started'
    | 'kg.explorer.query.completed'
    | 'kg.explorer.query.failed'
    | 'kg.explorer.cache.hit'
    | 'kg.explorer.cache.miss'
    | 'kg.explorer.graph.truncated'
    | 'kg.explorer.node.selected'
    | 'kg.explorer.expansion.completed'
    | 'kg.explorer.authorization.denied';
  requestId: string;
  userId?: string;
  scope?: string;
  projectId?: string | null;
  knowledgeBaseId?: string | null;
  latencyMs?: number;
  nodeCount?: number;
  edgeCount?: number;
  cacheHit?: boolean;
  truncated?: boolean;
  truncationReason?: string;
  /** Length only — never the raw query text (privacy). */
  queryLength?: number;
  errorCode?: string;
}

export class KgExplorerTelemetryService {
  private events: KgExplorerTelemetryEvent[] = [];
  private totalQueries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  public logEvent(event: KgExplorerTelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > 500) {
      this.events.shift();
    }

    if (event.event === 'kg.explorer.query.completed') {
      this.totalQueries++;
    } else if (event.event === 'kg.explorer.cache.hit') {
      this.cacheHits++;
    } else if (event.event === 'kg.explorer.cache.miss') {
      this.cacheMisses++;
    }

    // eslint-disable-next-line no-console
    console.log(`[KgExplorerTelemetry] ${event.event}`, event);
  }

  public getDiagnostics() {
    return {
      totalQueries: this.totalQueries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate:
        this.cacheHits + this.cacheMisses > 0
          ? ((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100).toFixed(1) + '%'
          : '0%',
      recentEvents: this.events.slice(-20)
    };
  }
}

export const kgExplorerTelemetryService = new KgExplorerTelemetryService();
