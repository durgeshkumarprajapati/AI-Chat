import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentService } from '@/features/documents/services/document.service';
import { sarvamDocumentTranslationService } from '@/features/sarvam/translation/sarvam-document-translation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    // Authorization check
    await documentService.getDocumentById(authUser.id, documentId);

    const translations = await sarvamDocumentTranslationService.getTranslationsForDocument(documentId);

    return NextResponse.json({
      success: true,
      data: translations
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
      { success: false, error: { code: 'TRANSLATION_FETCH_ERROR', message: errMsg } },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const documentId = params.id;

    // Authorization check
    await documentService.getDocumentById(authUser.id, documentId);

    const body = await req.json().catch(() => ({}));
    const targetLanguages: string[] = Array.isArray(body.targetLanguages) ? body.targetLanguages : [];
    const sourceLanguage: string | undefined = body.sourceLanguage;

    if (targetLanguages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'At least one target language must be provided.' } },
        { status: 400 }
      );
    }

    const jobs = await sarvamDocumentTranslationService.requestDocumentTranslation({
      documentId,
      userId: authUser.id,
      sourceLanguage,
      targetLanguages
    });

    return NextResponse.json({
      success: true,
      data: jobs
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
      { success: false, error: { code: 'TRANSLATION_REQUEST_ERROR', message: errMsg } },
      { status: 500 }
    );
  }
}
