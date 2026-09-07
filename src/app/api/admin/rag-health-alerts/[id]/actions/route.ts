import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';
import { getActionDefinition } from '@/features/rag/evaluation/rag-incident-action.registry';
import { ragIncidentActionService } from '@/features/rag/evaluation/rag-incident-action.service';
import { loadRagIncidentOperationsConfig } from '@/features/rag/evaluation/rag-incident-operations-config';

/**
 * Executes ONE allow-listed RAG incident operational action. There is no generic
 * "POST /execute?command=<anything>" — `actionType` must exactly match an entry in
 * RAG_INCIDENT_ACTIONS (validated here AND again inside the service, defense in depth) or the
 * request is rejected before anything executes. Same admin-only auth pattern as every other route
 * in this resource. Never resolves/acknowledges/changes the alert's lifecycle status — this is
 * exclusively an operational-action trigger.
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const opsConfig = await loadRagIncidentOperationsConfig();
    if (!opsConfig.actionsEnabled) {
      return NextResponse.json(
        { success: false, error: { code: 'FEATURE_DISABLED', message: 'RAG incident operational actions are not enabled.' } },
        { status: 403 }
      );
    }

    const existing = await ragHealthAlertService.getAlertById(params.id);
    if (!existing) {
      throw new NotFoundError('RAG health alert');
    }

    const body = await req.json().catch(() => ({}));
    const actionType = typeof body.actionType === 'string' ? body.actionType : undefined;
    if (!actionType || !getActionDefinition(actionType)) {
      throw new ValidationError('Unknown or unsupported action type.');
    }

    const result = await ragIncidentActionService.executeAction(actionType, params.id, authUser.id, 'MANUAL');

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to execute action' } },
      { status: 500 }
    );
  }
}

export const POST = handlePost;
