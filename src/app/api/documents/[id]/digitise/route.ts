import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { sarvamDigitisationService } from '@/features/sarvam/digitisation/sarvam-digitisation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    // Authorization check
    await documentService.getDocumentById(authUser.id, documentId);

    const result = await sarvamDigitisationService.digitiseDocument(documentId, authUser.id);

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
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: { code: 'DIGITISATION_ERROR', message: errMsg } },
      { status: 500 }
    );
  }
}
