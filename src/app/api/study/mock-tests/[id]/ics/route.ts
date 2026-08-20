import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { mockTest } = await scheduledMockTestService.getMockTestDetails(params.id, user.id);
    const endTime = new Date(mockTest.scheduledStartTime.getTime() + mockTest.durationMinutes * 60 * 1000);

    const icsContent = googleCalendarService.generateICalendarFile({
      title: `📝 AI Mock Test: ${mockTest.title}`,
      description: mockTest.description || `AI Generated Mock Test on ${mockTest.topic || mockTest.title}`,
      startTime: mockTest.scheduledStartTime,
      endTime
    });

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="mock-test-${params.id}.ics"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate .ics calendar file' },
      { status: 400 }
    );
  }
}
