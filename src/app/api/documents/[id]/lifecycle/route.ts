import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { documentManagementRepository } from '@/features/document-management';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const doc = await documentService.getDocumentById(authUser.id, params.id);
    const events = await documentManagementRepository.getLifecycleEvents(params.id);

    return NextResponse.json({
      success: true,
      data: {
        documentId: params.id,
        status: doc.status,
        isArchived: doc.isArchived,
        archivedAt: doc.archivedAt,
        isDeleted: doc.isDeleted,
        deletedAt: doc.deletedAt,
        activeVersionNumber: doc.activeVersionNumber,
        events
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve document lifecycle' } },
      { status: 500 }
    );
  }
}
