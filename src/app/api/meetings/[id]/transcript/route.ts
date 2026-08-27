import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { meetingIntelligenceService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (!body.rawContent || !body.rawContent.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Transcript content is required' } },
        { status: 400 }
      );
    }

    const transcript = await meetingIntelligenceService.ingestTranscript({
      meetingId: params.id,
      userId: authUser.id,
      rawContent: body.rawContent,
      language: body.language
    });

    return NextResponse.json({
      success: true,
      data: { transcript }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to ingest transcript' } },
      { status: 500 }
    );
  }
}
