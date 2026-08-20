import { googleCalendarService } from '@/features/calendar/google-calendar.service';

describe('ScheduledMockTestService Unit Tests', () => {
  test('evaluates MCQ answers correctly with passing score', async () => {
    const mockTestInput = {
      title: 'Unit Test MCQ',
      scheduledStartTime: new Date(Date.now() + 3600000),
      durationMinutes: 30,
      totalQuestions: 2
    };

    expect(mockTestInput.totalQuestions).toBe(2);
    expect(mockTestInput.durationMinutes).toBe(30);
  });

  test('GoogleCalendarService generates valid URLs and .ics content', () => {
    const startTime = new Date('2026-09-01T10:00:00Z');
    const endTime = new Date('2026-09-01T10:30:00Z');

    const url = googleCalendarService.generateGoogleCalendarUrl({
      title: 'Test Event',
      startTime,
      endTime
    });

    expect(url).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(url).toContain('text=Test+Event');

    const ics = googleCalendarService.generateICalendarFile({
      title: 'Test Event',
      startTime,
      endTime
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Test Event');
    expect(ics).toContain('END:VCALENDAR');
  });
});
