import { mockTestTimerService } from '@/features/mock-tests/mock-test-timer.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';

describe('MockTestTimerService & Calendar Unit Tests', () => {
  test('calculates server-authoritative remaining time for late join (scheduledEndAt - serverNow)', () => {
    const scheduledStart = new Date('2026-08-25T19:00:00Z');
    const nowServer = new Date('2026-08-25T19:10:00Z'); // Joined 10 mins late

    const timer = mockTestTimerService.calculateServerTimer({
      scheduledStartAt: scheduledStart,
      durationMinutes: 30,
      allowLateJoin: true,
      nowServer
    });

    expect(timer.isStarted).toBe(true);
    expect(timer.isExpired).toBe(false);
    expect(timer.canJoin).toBe(true);
    // Remaining time MUST be 20 minutes (1200 seconds), NOT 30 minutes!
    expect(timer.remainingSeconds).toBe(1200);
  });

  test('rejects late join when allowLateJoin is false', () => {
    const scheduledStart = new Date('2026-08-25T19:00:00Z');
    const nowServer = new Date('2026-08-25T19:10:00Z');

    const timer = mockTestTimerService.calculateServerTimer({
      scheduledStartAt: scheduledStart,
      durationMinutes: 30,
      allowLateJoin: false,
      nowServer
    });

    expect(timer.canJoin).toBe(false);
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
