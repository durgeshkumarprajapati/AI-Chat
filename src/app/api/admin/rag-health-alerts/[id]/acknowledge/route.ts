import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { AppError, NotFoundError } from '@/errors';
import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';
import { prisma } from '@/lib/prisma';

/**
 * OPEN -> ACKNOWLEDGED transition (Phase 5's lifecycle). Does not affect auto-resolution — the
 * next health check still resolves this alert automatically once its underlying condition clears,
 * exactly as an OPEN alert would (ragHealthAlertService.applyDetectedConditions treats OPEN and
 * ACKNOWLEDGED identically for both dedup-matching and auto-resolution).
 */
async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const existing = await prisma.ragHealthAlert.findUnique({ where: { id: params.id } });
    if (!existing) {
      throw new NotFoundError('RAG health alert');
    }

    const updated = await ragHealthAlertService.acknowledgeAlert(params.id, authUser.id);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to acknowledge RAG health alert' } },
      { status: 500 }
    );
  }
}

export const POST = handlePost;
