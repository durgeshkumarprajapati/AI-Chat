import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { AppError, NotFoundError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';
import { ragIncidentDiagnosticsService } from '@/features/rag/evaluation/rag-incident-diagnostics.service';
import { getRunbookRecommendations } from '@/features/rag/evaluation/rag-incident-runbook.registry';
import { listActionDefinitions } from '@/features/rag/evaluation/rag-incident-action.registry';
import { ragIncidentActionService } from '@/features/rag/evaluation/rag-incident-action.service';
import { loadRagIncidentOperationsConfig } from '@/features/rag/evaluation/rag-incident-operations-config';

/**
 * Single-alert lookup (Incident Operations Dashboard pass) — exists so notification deep-linking
 * (Notification.metadata.deepLink -> /admin/rag-health-alerts?alertId=...) can resolve an
 * arbitrary alert regardless of the main list's current filters/pagination bound, without an
 * unbounded/unsafe "fetch everything and search" fallback on the frontend. Same admin-only
 * auth pattern as every other route in this resource; same 404-on-missing pattern as the
 * acknowledge route.
 *
 * RAG Incident Response Automation pass — additively includes diagnostics/runbooks/
 * availableActions/recentActions, gated by RAG_INCIDENT_OPERATIONS_ENABLED. When disabled (the
 * conservative default), the response is byte-identical to before this pass. Each addition is its
 * own try/catch so a failure in any one of them never breaks the base alert response that already
 * worked before this pass existed.
 */
async function handleGet(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const alert = await ragHealthAlertService.getAlertById(params.id);
    if (!alert) {
      throw new NotFoundError('RAG health alert');
    }

    const opsConfig = await loadRagIncidentOperationsConfig();
    if (!opsConfig.operationsEnabled) {
      return NextResponse.json({ success: true, data: alert });
    }

    let diagnostics = null;
    try {
      diagnostics = await ragIncidentDiagnosticsService.getDiagnostics(alert);
    } catch (err) {
      console.error(`[GET /rag-health-alerts/${params.id}] Diagnostics failed:`, err instanceof Error ? err.message : err);
    }

    let recentActions: Array<Record<string, unknown>> = [];
    try {
      recentActions = await ragIncidentActionService.listRecentActions(params.id);
    } catch (err) {
      console.error(`[GET /rag-health-alerts/${params.id}] Recent actions lookup failed:`, err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...alert,
        diagnostics,
        runbooks: getRunbookRecommendations(alert.category),
        availableActions: listActionDefinitions(),
        recentActions
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load RAG health alert' } },
      { status: 500 }
    );
  }
}

export const GET = handleGet;
