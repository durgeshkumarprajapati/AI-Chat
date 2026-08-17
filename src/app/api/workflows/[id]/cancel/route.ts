import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowSessionService } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const runId = body.runId || params.id;
    const res = await workflowSessionService.cancelRun(user.id, runId);
    return NextResponse.json({ success: res.success, message: res.message });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
