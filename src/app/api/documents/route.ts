import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { AppError, ValidationError } from '@/errors';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);

    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('document')) as File | null;

    if (!file) {
      throw new ValidationError('Upload request must include a "file" in multipart/form-data');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const document = await documentService.uploadDocument(authUser.id, {
      filename: file.name,
      mimeType: file.type || 'application/pdf',
      fileSize: file.size,
      buffer
    });

    return NextResponse.json(
      {
        success: true,
        data: document
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            ...('errors' in error ? { details: (error as ValidationError).errors } : {})
          }
        },
        { status: error.statusCode }
      );
    }

    console.error('Unhandled upload API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred during document upload.'
        }
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const documents = await documentService.getUserDocuments(authUser.id);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve documents' } },
      { status: 500 }
    );
  }
}
