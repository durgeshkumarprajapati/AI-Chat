import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { AppError } from '@/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    const { buffer, filename, mimeType } = await documentService.downloadDocument(authUser.id, documentId);

    const headers = new Headers();
    headers.set('Content-Type', mimeType || 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    headers.set('Content-Length', buffer.length.toString());

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Failed to download document:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to download document' } },
      { status: 500 }
    );
  }
}
