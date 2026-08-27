import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentIntelligenceRepository } from '@/features/document-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    // Ownership check via the existing document service — DocumentIntelligence has no
    // independent authorization of its own, exactly like DocumentChunk's isolation-via-parent-join.
    await documentService.getDocumentById(authUser.id, documentId);

    const intelligence = await documentIntelligenceRepository.getByDocumentId(documentId);
    const { multimodalRepository } = await import('@/features/multimodal-document-intelligence/multimodal.repository');
    const multimodalRun = await multimodalRepository.getByDocumentId(documentId);

    return NextResponse.json({
      success: true,
      data: { intelligence, multimodalRun }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Failed to retrieve document intelligence:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve document intelligence' } },
      { status: 500 }
    );
  }
}
