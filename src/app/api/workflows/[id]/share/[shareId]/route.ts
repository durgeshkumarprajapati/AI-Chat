import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowShareService } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; shareId: string } }
) {
  try {
    const user = await getAuthUser(req);
    await workflowShareService.revokeShare(user.id, params.shareId);
    return NextResponse.json({ success: true, message: 'Share revoked' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
