export interface GraphTelemetryEvent {
  event:
    | 'knowledge_graph.extraction.started'
    | 'knowledge_graph.extraction.completed'
    | 'knowledge_graph.extraction.failed'
    | 'knowledge_graph.entity.created'
    | 'knowledge_graph.relationship.created'
    | 'knowledge_graph.conflict.detected'
    | 'knowledge_graph.query.completed'
    | 'knowledge_graph.cache.hit'
    | 'knowledge_graph.cache.miss'
    | 'knowledge_graph.security.denied';
  userId?: string;
  projectId?: string | null;
  documentId?: string | null;
  durationMs?: number;
  entityCount?: number;
  relationshipCount?: number;
  cacheHit?: boolean;
}

export class KnowledgeGraphTelemetryService {
  private events: GraphTelemetryEvent[] = [];
  private totalQueries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  public logEvent(event: GraphTelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > 500) {
      this.events.shift();
    }

    if (event.event === 'knowledge_graph.query.completed') {
      this.totalQueries++;
    } else if (event.event === 'knowledge_graph.cache.hit') {
      this.cacheHits++;
    } else if (event.event === 'knowledge_graph.cache.miss') {
      this.cacheMisses++;
    }
  }

  public getDiagnostics() {
    return {
      totalQueries: this.totalQueries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate:
        this.totalQueries > 0 ? ((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100).toFixed(1) + '%' : '0%',
      recentEvents: this.events.slice(-20)
    };
  }
}

export const knowledgeGraphTelemetryService = new KnowledgeGraphTelemetryService();
