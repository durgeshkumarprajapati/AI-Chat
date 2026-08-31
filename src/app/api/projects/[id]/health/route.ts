import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectHealthService } from '@/features/project-intelligence/project-health.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

// GET returns the latest persisted ProjectHealthSnapshot (or, with ?history=true, up to the
// last 20). Authorization is enforced inside projectHealthService itself. This never computes a
// fresh snapshot — that only happens via POST /projects/[id]/intelligence or a future worker job.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const wantsHistory = searchParams.get('history') === 'true';

    if (wantsHistory) {
      const limitParam = parseInt(searchParams.get('limit') || '20', 10);
      const history = await projectHealthService.getHealthHistory(authUser.id, params.id, Number.isFinite(limitParam) ? limitParam : 20);
      return NextResponse.json({ success: true, data: history });
    }

    const latest = await projectHealthService.getLatestHealth(authUser.id, params.id);
    return NextResponse.json({ success: true, data: latest });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch project health' } },
      { status: 500 }
    );
  }
}
