import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole, RagHealthAlertStatus, RagHealthAlertSeverity, RagHealthAlertCategory } from '@prisma/client';
import { AppError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';
import { isRagHealthTimeWindow, WINDOW_MS } from '@/features/rag/evaluation/rag-health.service';

const VALID_STATUSES: RagHealthAlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const VALID_SEVERITIES: RagHealthAlertSeverity[] = ['WARNING', 'CRITICAL'];
const VALID_CATEGORIES: RagHealthAlertCategory[] = ['CITATION', 'GRAPH', 'RETRIEVAL', 'RELIABILITY'];

/**
 * Current active alerts + alert history (Phase 6). Reuses the exact same admin auth pattern as
 * /api/admin/performance (requireAuthenticatedUser + requireRole(ADMIN) — nothing weakened, nothing
 * new introduced). Returns ONLY operational metadata already defined on RagHealthAlert — no raw
 * RAG content exists on that model by design, so there is nothing to accidentally leak here.
 */
async function handleGet(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const statusParam = req.nextUrl.searchParams.get('status');
    const status = statusParam && VALID_STATUSES.includes(statusParam as RagHealthAlertStatus)
      ? (statusParam as RagHealthAlertStatus)
      : undefined;
    const categoryParam = req.nextUrl.searchParams.get('category');
    const category = categoryParam && VALID_CATEGORIES.includes(categoryParam as RagHealthAlertCategory)
      ? (categoryParam as RagHealthAlertCategory)
      : undefined;
    // Incident Operations Dashboard pass — additive severity + time-range filters. Both undefined
    // for every pre-existing caller, so listAlerts()'s where clause is unchanged when omitted.
    const severityParam = req.nextUrl.searchParams.get('severity');
    const severity = severityParam && VALID_SEVERITIES.includes(severityParam as RagHealthAlertSeverity)
      ? (severityParam as RagHealthAlertSeverity)
      : undefined;
    const timeRangeParam = req.nextUrl.searchParams.get('timeRange');
    const since = isRagHealthTimeWindow(timeRangeParam) ? new Date(Date.now() - WINDOW_MS[timeRangeParam]) : undefined;
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const alerts = await ragHealthAlertService.listAlerts({ status, category, severity, since, limit });

    return NextResponse.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load RAG health alerts' } },
      { status: 500 }
    );
  }
}

export const GET = handleGet;
