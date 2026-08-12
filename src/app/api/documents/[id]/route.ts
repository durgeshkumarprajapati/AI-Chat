import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentRepository } from '@/features/documents/repositories/document.repository';
import { AppError } from '@/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    const document = await documentRepository.findByIdAndUser(documentId, authUser.id);
    if (!document) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } },
        { status: 404 }
      );
    }

    const chunkStats = await documentRepository.getDocumentChunkStats(documentId);
    const chunks = await documentRepository.getDocumentChunksDetail(documentId);

    return NextResponse.json({
      success: true,
      data: {
        document,
        chunkStats,
        chunks
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Failed to retrieve document detail:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve document detail' } },
      { status: 500 }
    );
  }
}
