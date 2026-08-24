import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { AppError, ValidationError } from '@/errors';
import { DocumentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

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
    const { searchParams } = new URL(req.url);

    const pageStr = searchParams.get('page');
    const pageSizeStr = searchParams.get('pageSize');
    const search = searchParams.get('search') || undefined;
    const statusRaw = searchParams.get('status') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrderRaw = searchParams.get('sortOrder') || undefined;

    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;

    if (isNaN(page) || page < 1) {
      throw new ValidationError('Page parameter must be a positive integer');
    }
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new ValidationError('PageSize parameter must be an integer between 1 and 50');
    }

    let status: DocumentStatus | undefined = undefined;
    if (statusRaw && statusRaw !== 'ALL') {
      if (!Object.values(DocumentStatus).includes(statusRaw as DocumentStatus)) {
        throw new ValidationError(`Invalid status filter "${statusRaw}"`);
      }
      status = statusRaw as DocumentStatus;
    }

    const sortOrder: 'asc' | 'desc' = sortOrderRaw === 'asc' ? 'asc' : 'desc';

    const result = await documentService.listUserDocumentsPaginated(authUser.id, {
      page,
      pageSize,
      search,
      status,
      sortBy,
      sortOrder
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
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve documents' } },
      { status: 500 }
    );
  }
}
