import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { contradictionService } from '@/features/knowledge-graph/reasoning/contradiction.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    const conflicts = await contradictionService.detectClaimContradictions(user.id, projectId);

    return NextResponse.json({
      success: true,
      data: conflicts
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to detect conflicts.' },
      { status: err.status || 500 }
    );
  }
}
