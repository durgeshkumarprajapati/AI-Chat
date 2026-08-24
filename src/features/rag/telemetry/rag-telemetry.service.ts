export interface RAGTelemetryEvent {
  event:
    | 'rag.query.received'
    | 'rag.query.analyzed'
    | 'rag.retrieval.completed'
    | 'rag.fusion.completed'
    | 'rag.reranked.completed'
    | 'rag.answer.generated'
    | 'rag.legacy.fallback'
    | 'rag.pipeline.failed';
  userId: string;
  queryLength: number;
  intent?: string;
  strategy?: 'LEGACY' | 'HYBRID';
  retrievedCount?: number;
  finalContextCount?: number;
  latencyMs?: number;
  confidence?: string;
  provider?: string;
  usedFallback?: boolean;
}

export class RAGTelemetryService {
  public logEvent(event: RAGTelemetryEvent): void {
    console.log(`[RAGTelemetry] event=${event.event} timestamp=${new Date().toISOString()} meta=${JSON.stringify(event)}`);
  }
}

export const ragTelemetryService = new RAGTelemetryService();
