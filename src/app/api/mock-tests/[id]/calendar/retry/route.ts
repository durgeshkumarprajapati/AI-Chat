import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: mockTestId } = await params;

    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });

    if (!mockTest) {
      return NextResponse.json({ success: false, error: 'Mock test not found' }, { status: 404 });
    }

    // Verify ownership or participation
    const isCreator = mockTest.createdById === user.id;
    const participant = await prisma.mockTestParticipant.findUnique({
      where: { mockTestId_userId: { mockTestId, userId: user.id } }
    });

    if (!isCreator && !participant) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You must be the creator or a registered participant of this mock test' },
        { status: 403 }
      );
    }

    const scheduledStart = new Date(mockTest.scheduledStartTime);
    const scheduledEnd = new Date(scheduledStart.getTime() + mockTest.durationMinutes * 60 * 1000);

    const eventDetails = {
      mockTestId: mockTest.id,
      title: `📝 AI Mock Test: ${mockTest.title}`,
      description: mockTest.description || `AI Generated Mock Test on ${mockTest.topic || mockTest.title}`,
      startTime: scheduledStart,
      endTime: scheduledEnd
    };

    const apiResult = await googleCalendarService.createCalendarEventViaApi(user.id, eventDetails);

    if (!apiResult.success) {
      const syncStatus = apiResult.errorCode === 'GOOGLE_CALENDAR_NOT_CONNECTED' ? 'NOT_CONNECTED' : 'FAILED';
      await prisma.scheduledMockTest.update({
        where: { id: mockTest.id },
        data: {
          googleCalendarSyncStatus: syncStatus,
          googleCalendarSyncError: apiResult.error
        }
      });

      return NextResponse.json(
        {
          success: false,
          error: apiResult.error,
          errorCode: apiResult.errorCode,
          googleCalendarSyncStatus: syncStatus
        },
        { status: 400 }
      );
    }

    const updated = await prisma.scheduledMockTest.update({
      where: { id: mockTest.id },
      data: {
        googleCalendarEventId: apiResult.eventId,
        googleCalendarEventUrl: apiResult.htmlLink,
        googleCalendarLink: apiResult.htmlLink,
        googleCalendarSyncStatus: 'SYNCED',
        googleCalendarSyncedAt: new Date(),
        googleCalendarSyncError: null
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Google Calendar event synced successfully',
      googleCalendarEventId: updated.googleCalendarEventId,
      googleCalendarEventUrl: updated.googleCalendarEventUrl,
      googleCalendarSyncStatus: updated.googleCalendarSyncStatus
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
