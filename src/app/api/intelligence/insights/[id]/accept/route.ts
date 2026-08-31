import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { insightReviewService } from '@/features/knowledge-intelligence/insight-review.service';

export const dynamic = 'force-dynamic';

// Thin sibling of the existing /api/intelligence/insights/[id]/review route: fixes the review
// action to CONFIRM ("accept") and calls the SAME insightReviewService.reviewInsight — no
// separate review workflow, no duplicated authorization/audit logic.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const note = typeof body?.note === 'string' ? body.note : undefined;

    const outcome = await insightReviewService.reviewInsight(user.id, params.id, 'CONFIRM', note);
    return NextResponse.json({ success: true, data: outcome });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json({ success: false, error: err.message || 'Failed to accept insight' }, { status });
  }
}
