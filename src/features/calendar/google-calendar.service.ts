export interface CalendarEventDetails {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
}

export class GoogleCalendarService {
  /**
   * Generates a 1-click Google Calendar Event Template URL
   */
  public generateGoogleCalendarUrl(event: CalendarEventDetails): string {
    const formatTime = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const startStr = formatTime(event.startTime);
    const endStr = formatTime(event.endTime);

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${startStr}/${endStr}`,
      details: event.description || '',
      location: event.location || 'Document AI Collaboration Platform'
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /**
   * Generates a standard .ics iCalendar file string for Apple Calendar, Outlook, and mobile devices
   */
  public generateICalendarFile(event: CalendarEventDetails): string {
    const formatTime = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const nowStr = formatTime(new Date());

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Document AI RAG Platform//Scheduled Mock Test//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:mocktest-${Date.now()}@document-ai-platform`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${formatTime(event.startTime)}`,
      `DTEND:${formatTime(event.endTime)}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${event.location || 'Document AI Collaboration Platform'}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder: AI Mock Test starting in 15 minutes',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }
}

export const googleCalendarService = new GoogleCalendarService();
