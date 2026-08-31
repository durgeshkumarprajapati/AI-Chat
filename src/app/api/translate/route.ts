import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sarvamTextTranslationService } from '@/features/sarvam/translation/sarvam-text-translation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim() : '';
    const sourceLanguage = typeof body.sourceLanguage === 'string' ? body.sourceLanguage.trim() : undefined;

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Parameters "text" and "targetLanguage" are required.' } },
        { status: 400 }
      );
    }

    const result = await sarvamTextTranslationService.translateText({
      text,
      sourceLanguage,
      targetLanguage,
      userId: authUser.id
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
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: { code: 'TEXT_TRANSLATION_ERROR', message: errMsg } },
      { status: 500 }
    );
  }
}
