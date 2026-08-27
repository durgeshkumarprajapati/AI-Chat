import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentVersionComparisonService } from '@/features/document-management';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await documentService.getDocumentById(authUser.id, params.id);
    const body = await req.json().catch(() => ({}));

    const result = await documentVersionComparisonService.compare({
      documentId: params.id,
      versionA: Number(body.versionA) || 1,
      versionB: Number(body.versionB) || 2
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to compare document versions' } },
      { status: 500 }
    );
  }
}
