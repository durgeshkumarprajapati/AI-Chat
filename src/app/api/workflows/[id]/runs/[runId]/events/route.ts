import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowRepository } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; runId: string } }
) {
  try {
    const user = await getAuthUser(req);
    const run = await workflowRepository.getRunById(params.runId, user.id);
    if (!run) return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 });

    const events = (run.runNodes || []).map((rn) => ({
      nodeKey: rn.nodeKey,
      status: rn.status,
      startedAt: rn.startedAt,
      completedAt: rn.completedAt,
      error: rn.error
    }));

    return NextResponse.json({ success: true, data: events });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
