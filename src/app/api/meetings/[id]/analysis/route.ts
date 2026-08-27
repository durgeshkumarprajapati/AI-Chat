import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { meetingIntelligenceService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const detail = await meetingIntelligenceService.getMeetingDetail(authUser.id, params.id);

    return NextResponse.json({
      success: true,
      data: { analysis: detail.analysis || null }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve meeting analysis' } },
      { status: 500 }
    );
  }
}
