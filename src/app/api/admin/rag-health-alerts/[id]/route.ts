import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { AppError, NotFoundError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';

/**
 * Single-alert lookup (Incident Operations Dashboard pass) — exists so notification deep-linking
 * (Notification.metadata.deepLink -> /admin/rag-health-alerts?alertId=...) can resolve an
 * arbitrary alert regardless of the main list's current filters/pagination bound, without an
 * unbounded/unsafe "fetch everything and search" fallback on the frontend. Same admin-only
 * auth pattern as every other route in this resource; same 404-on-missing pattern as the
 * acknowledge route.
 */
async function handleGet(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const alert = await ragHealthAlertService.getAlertById(params.id);
    if (!alert) {
      throw new NotFoundError('RAG health alert');
    }

    return NextResponse.json({ success: true, data: alert });
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
