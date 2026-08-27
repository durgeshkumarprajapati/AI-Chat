import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentReindexService } from '@/features/document-management';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await documentService.getDocumentById(authUser.id, params.id);
    const body = await req.json().catch(() => ({}));

    const result = await documentReindexService.requestReindex({
      documentId: params.id,
      userId: authUser.id,
      options: {
        strategy: body.strategy || 'FULL_REINDEX',
        reembed: body.reembed,
        reextractMetadata: body.reextractMetadata,
        reclassifyDoctype: body.reclassifyDoctype
      }
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
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to request document reindex' } },
      { status: 500 }
    );
  }
}
