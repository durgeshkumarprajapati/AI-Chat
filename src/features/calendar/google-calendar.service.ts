import { prisma } from '@/lib/prisma';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export interface CalendarEventDetails {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
}

export class GoogleCalendarService {
  /**
   * Create Google Calendar Event via Google API with explicit attendees, sendUpdates='all', and email/popup reminders
   */
  public async createCalendarEventViaApi(userId: string, event: CalendarEventDetails, attendeeEmails: string[] = []) {
    const attendees = attendeeEmails.map((email) => ({ email }));

    console.log('[GoogleCalendar] Creating event');
    console.log('[GoogleCalendar] calendarId=primary');
    console.log(`[GoogleCalendar] start=${event.startTime.toISOString()}`);
    console.log(`[GoogleCalendar] end=${event.endTime.toISOString()}`);
    console.log(`[GoogleCalendar] attendees=${JSON.stringify(attendees)}`);
    console.log('[GoogleCalendar] sendUpdates=all');

    try {
      const integration = await prisma.googleIntegration.findUnique({
        where: { userId }
      });

      if (!integration || !integration.encryptedAccessToken) {
        console.warn(`[GoogleCalendar] User ${userId} does not have an active Google OAuth integration. Falling back to template URL.`);
        return null;
      }

      const accessToken = googleAuthService.decryptToken(integration.encryptedAccessToken);

      const requestBody = {
        summary: event.title,
        description: event.description || 'AI-Generated MCQ Mock Test Session',
        location: event.location || 'Document AI Collaboration Platform',
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
        attendees,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 30 },
            { method: 'popup', minutes: 15 },
            { method: 'popup', minutes: 5 }
          ]
        }
      };

      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[GoogleCalendar] API Creation Failed (HTTP ${res.status}): ${errorText}`);
        return null;
      }

      const data = await res.json();
      console.log(`[GoogleCalendar] eventId=${data.id}`);
      console.log(`[GoogleCalendar] htmlLink=${data.htmlLink}`);

      return {
        eventId: data.id,
        htmlLink: data.htmlLink
      };
    } catch (err: any) {
      console.error('[GoogleCalendar] Exception creating calendar event:', err?.message || err);
      return null;
    }
  }

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
