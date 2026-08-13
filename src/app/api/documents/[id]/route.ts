import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentRepository } from '@/features/documents/repositories/document.repository';
import { AppError } from '@/errors';
import { env } from '@/config/env';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    const document = await documentService.getDocumentById(authUser.id, documentId);
    const chunkStats = await documentRepository.getDocumentChunkStats(documentId);
    const chunks = await documentRepository.getDocumentChunksDetail(documentId);
    const storageProvider =
      process.env.AWS_STORAGE_PROVIDER ||
      process.env.STORAGE_PROVIDER ||
      env.server?.AWS_STORAGE_PROVIDER ||
      'local';

    return NextResponse.json({
      success: true,
      data: {
        document,
        chunkStats,
        chunks,
        storageProvider
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    await documentService.deleteDocument(authUser.id, documentId);

    return NextResponse.json({
      success: true,
      data: { message: 'Document and storage objects deleted successfully' }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Failed to delete document:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete document' } },
      { status: 500 }
    );
  }
}
