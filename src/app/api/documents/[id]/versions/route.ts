import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentVersionService } from '@/features/document-management';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await documentService.getDocumentById(authUser.id, params.id);

    const versions = await documentVersionService.listVersions(params.id);

    return NextResponse.json({
      success: true,
      data: { versions }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list document versions' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await documentService.getDocumentById(authUser.id, params.id);
    const body = await req.json().catch(() => ({}));

    const version = await documentVersionService.createNextVersion({
      documentId: params.id,
      storageKey: body.storageKey || `docs/${params.id}/v-next`,
      contentHash: body.contentHash || 'hash',
      fileSize: body.fileSize || 1024,
      pageCount: body.pageCount || 1,
      uploadedByUserId: authUser.id,
      isActive: body.isActive ?? true
    });

    return NextResponse.json({
      success: true,
      data: { version }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create document version' } },
      { status: 500 }
    );
  }
}
