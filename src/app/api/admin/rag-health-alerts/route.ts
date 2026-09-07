import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole, RagHealthAlertStatus } from '@prisma/client';
import { AppError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';

const VALID_STATUSES: RagHealthAlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];

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
    const category = req.nextUrl.searchParams.get('category') || undefined;
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const alerts = await ragHealthAlertService.listAlerts({ status, category, limit });

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
