import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowShareService } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    if (!body.email) return NextResponse.json({ success: false, error: 'Target email is required' }, { status: 400 });

    const share = await workflowShareService.shareWorkflow(user.id, params.id, body.email, body.permission);
    return NextResponse.json({ success: true, data: share });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
