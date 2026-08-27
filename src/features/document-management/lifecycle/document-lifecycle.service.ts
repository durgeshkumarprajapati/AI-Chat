import { DocumentStatus } from '@prisma/client';
import { env } from '@/config/env';
import { documentManagementRepository } from '../document-management.repository';
import { documentLifecycleTelemetryService } from '../telemetry/document-lifecycle-telemetry.service';
import { auditService } from '@/features/audit/audit.service';

export const ALLOWED_LIFECYCLE_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT: ['UPLOADING', 'PROCESSING', 'DELETED'],
  UPLOADING: ['PROCESSING', 'FAILED', 'DELETED'],
  PROCESSING: ['READY', 'COMPLETED', 'ACTIVE', 'FAILED', 'DELETED'],
  READY: ['ACTIVE', 'SUPERSEDED', 'REINDEXING', 'ARCHIVED', 'DELETED'],
  COMPLETED: ['ACTIVE', 'SUPERSEDED', 'REINDEXING', 'ARCHIVED', 'DELETED'],
  ACTIVE: ['SUPERSEDED', 'REINDEXING', 'ARCHIVED', 'DELETING', 'DELETED'],
  SUPERSEDED: ['ACTIVE', 'ARCHIVED', 'DELETING', 'DELETED'],
  REINDEXING: ['ACTIVE', 'READY', 'COMPLETED', 'FAILED', 'DELETED'],
  ARCHIVED: ['ACTIVE', 'DELETING', 'DELETED'],
  FAILED: ['REINDEXING', 'DELETING', 'DELETED'],
  DELETING: ['DELETED'],
  DELETED: [] // Terminal state
};

export class DocumentLifecycleService {
  public validateTransition(currentStatus: DocumentStatus, targetStatus: DocumentStatus): boolean {
    if (currentStatus === targetStatus) return true;
    const allowed = ALLOWED_LIFECYCLE_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  public async transition(input: {
    documentId: string;
    userId: string;
    targetStatus: DocumentStatus;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; previousStatus: DocumentStatus; newStatus: DocumentStatus }> {
    const doc = await documentManagementRepository.getDocument(input.documentId);
    if (!doc) {
      throw new Error(`Document ${input.documentId} not found.`);
    }

    const currentStatus = doc.status;

    if (!this.validateTransition(currentStatus, input.targetStatus)) {
      throw new Error(
        `Invalid lifecycle transition from ${currentStatus} to ${input.targetStatus} for document ${input.documentId}.`
      );
    }

    const updated = await documentManagementRepository.updateDocumentStatus({
      documentId: input.documentId,
      status: input.targetStatus,
      isArchived: input.targetStatus === 'ARCHIVED',
      archivedAt: input.targetStatus === 'ARCHIVED' ? new Date() : (input.targetStatus === 'ACTIVE' ? null : doc.archivedAt),
      isDeleted: input.targetStatus === 'DELETED',
      deletedAt: input.targetStatus === 'DELETED' ? new Date() : (input.targetStatus === 'ACTIVE' ? null : doc.deletedAt)
    });

    // Record immutable lifecycle event
    await documentManagementRepository.createLifecycleEvent({
      documentId: input.documentId,
      userId: input.userId,
      eventType: this.mapStatusToEventType(input.targetStatus),
      previousState: currentStatus,
      newState: input.targetStatus,
      metadata: input.metadata || { reason: input.reason || 'State transition' }
    });

    if (env.server?.DOCUMENT_LIFECYCLE_AUDIT_ENABLED) {
      await auditService.logEvent({
        actorId: input.userId,
        action: `DOCUMENT_STATUS_${input.targetStatus}`,
        targetType: 'DOCUMENT',
        targetId: input.documentId,
        details: {
          previousStatus: currentStatus,
          newStatus: input.targetStatus,
          reason: input.reason
        }
      });
    }

    documentLifecycleTelemetryService.logEvent({
      event: 'document.lifecycle.started',
      documentId: input.documentId,
      tenantId: input.userId,
      previousState: currentStatus,
      newState: input.targetStatus
    });

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus: updated.status
    };
  }

  private mapStatusToEventType(status: DocumentStatus): any {
    switch (status) {
      case 'ARCHIVED':
        return 'DOCUMENT_ARCHIVED';
      case 'ACTIVE':
        return 'DOCUMENT_VERSION_ACTIVATED';
      case 'SUPERSEDED':
        return 'DOCUMENT_VERSION_SUPERSEDED';
      case 'DELETED':
        return 'DOCUMENT_SOFT_DELETED';
      case 'REINDEXING':
        return 'DOCUMENT_REINDEX_STARTED';
      default:
        return 'DOCUMENT_UPLOADED';
    }
  }
}

export const documentLifecycleService = new DocumentLifecycleService();
