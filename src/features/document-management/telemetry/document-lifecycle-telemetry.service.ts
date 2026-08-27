export type DocumentLifecycleEventType =
  | 'document.lifecycle.started'
  | 'document.duplicate.detected'
  | 'document.version.created'
  | 'document.version.activated'
  | 'document.reindex.started'
  | 'document.reindex.completed'
  | 'document.reindex.failed'
  | 'document.archived'
  | 'document.restored'
  | 'document.deleted'
  | 'document.permanent_delete.completed';

export interface DocumentLifecycleTelemetryEvent {
  event: DocumentLifecycleEventType;
  documentId: string;
  tenantId: string;
  previousState?: string;
  newState?: string;
  versionNumber?: number;
  operation?: string;
  matchType?: string;
  confidence?: number;
  error?: string;
}

export class DocumentLifecycleTelemetryService {
  public logEvent(payload: DocumentLifecycleTelemetryEvent): void {
    const serialized = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload
    });
    console.log(`[DocumentLifecycleTelemetry] ${serialized}`);
  }
}

export const documentLifecycleTelemetryService = new DocumentLifecycleTelemetryService();
