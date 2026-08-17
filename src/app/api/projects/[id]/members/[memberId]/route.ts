import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectService } from '@/features/projects/project.service';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  try {
    const user = await getAuthUser(req);
    await projectService.removeMember(params.id, user.id, params.memberId);
    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 403 });
  }
}
