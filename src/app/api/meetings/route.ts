import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { meetingIntelligenceService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;

    const meetings = await meetingIntelligenceService.listMeetings(authUser.id, projectId);

    return NextResponse.json({
      success: true,
      data: { meetings }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list meetings' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (!body.title || !body.title.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Meeting title is required' } },
        { status: 400 }
      );
    }

    const meeting = await meetingIntelligenceService.createMeeting({
      userId: authUser.id,
      title: body.title,
      description: body.description,
      projectId: body.projectId,
      meetingDate: body.meetingDate,
      sourceProvider: body.sourceProvider,
      participants: body.participants
    });

    return NextResponse.json({
      success: true,
      data: { meeting }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create meeting' } },
      { status: 500 }
    );
  }
}
