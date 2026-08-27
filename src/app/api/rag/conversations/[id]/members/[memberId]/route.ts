import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { groupRagService } from '@/features/rag/collaboration/group-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();

    const { role } = body;
    const result = await groupRagService.updateMemberRole(authUser.id, params.id, params.memberId, role);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update member role' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    await groupRagService.removeMember(authUser.id, params.id, params.memberId);
    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove member' } },
      { status: 500 }
    );
  }
}
