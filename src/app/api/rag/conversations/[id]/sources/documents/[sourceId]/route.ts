import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { groupRagService } from '@/features/rag/collaboration/group-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    await groupRagService.removeDocumentSource(authUser.id, params.id, params.sourceId);
    return NextResponse.json({ success: true, message: 'Document source removed' });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove document source' } },
      { status: 500 }
    );
  }
}
