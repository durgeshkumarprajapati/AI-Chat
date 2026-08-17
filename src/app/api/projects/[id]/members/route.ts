import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectService } from '@/features/projects/project.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.userId || !body.role) {
      return NextResponse.json({ success: false, error: 'userId and role are required' }, { status: 400 });
    }

    await projectService.addMember(params.id, user.id, body.userId, body.role);
    return NextResponse.json({ success: true, message: 'Member added' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 403 });
  }
}
