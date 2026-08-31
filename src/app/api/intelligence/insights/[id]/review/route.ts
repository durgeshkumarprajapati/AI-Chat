import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { insightReviewService } from '@/features/knowledge-intelligence/insight-review.service';
import { ValidationError } from '@/errors';
import { InsightReviewAction } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS: InsightReviewAction[] = ['CONFIRM', 'DISMISS', 'RESOLVE', 'NOTE'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Never trust a client-supplied userId in the body — always derive the reviewer from auth.
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action as InsightReviewAction;
    const note = typeof body?.note === 'string' ? body.note : undefined;

    if (!action || !VALID_ACTIONS.includes(action)) {
      throw new ValidationError(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }

    const outcome = await insightReviewService.reviewInsight(user.id, params.id, action, note);
    return NextResponse.json({ success: true, data: outcome });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json({ success: false, error: err.message || 'Failed to review insight' }, { status });
  }
}
