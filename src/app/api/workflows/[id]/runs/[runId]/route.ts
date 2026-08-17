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
    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
