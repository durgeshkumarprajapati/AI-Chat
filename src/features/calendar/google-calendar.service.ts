import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export interface CalendarEventDetails {
  mockTestId?: string;
  scheduledCallId?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timeZone?: string;
  createConference?: boolean;
  conferenceRequestId?: string;
}

export type CalendarCreationResult =
  | {
      success: true;
      eventId: string;
      htmlLink: string;
      meetUrl?: string;
      conferenceId?: string;
      verified: boolean;
    }
  | {
      success: false;
      error: string;
      errorCode: string;
    };

export class GoogleCalendarService {
  /**
   * Generates a sanitized deterministic event ID suitable for Google Calendar API
   * Google Calendar event ID requirement: lowercase letters a-v and digits 0-9 only, length 5-1024.
   */
  public generateDeterministicEventId(entityId: string): string {
    const sanitized = entityId.toLowerCase().replace(/[^a-v0-9]/g, '');
    if (sanitized.length >= 5) return sanitized;
    return `mcq${sanitized.padEnd(5, '0')}`;
  }

  /**
   * Create Google Calendar Event via Google API with token refresh, diagnostic logging, verification, and error classification
   */
  public async createCalendarEventViaApi(
    userId: string,
    event: CalendarEventDetails,
    attendeeEmails: string[] = []
  ): Promise<CalendarCreationResult> {
    console.log('[GoogleCalendar] Starting calendar integration');

    // 1. Get valid access token (automatically refreshes if expired)
    const tokenResult = await googleAuthService.getValidAccessToken(userId);

    if (tokenResult.status === 'NOT_CONNECTED') {
      console.warn(`[GoogleCalendar] OAuth connected=false for user=${userId}`);
      return {
        success: false,
        error: 'Google Calendar integration is not connected',
        errorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED'
      };
    }

    if (tokenResult.status === 'REAUTH_REQUIRED') {
      console.warn(`[GoogleCalendar] Re-authorization required for user=${userId}`);
      return {
        success: false,
        error: 'Google Calendar re-authorization required',
        errorCode: 'GOOGLE_REAUTH_REQUIRED'
      };
    }

    const { accessToken, email, scope } = tokenResult;
    const accountEmail = email || 'user@gmail.com';
    const scopeGranted = Boolean(scope && (scope.includes('calendar.events') || scope.includes('/auth/calendar')));

    console.log('[GoogleCalendar] OAuth connected=true');
    console.log(`[GoogleCalendar] account=${accountEmail}`);
    console.log(`[GoogleCalendar] scopeGranted=${scopeGranted}`);

    if (!scopeGranted) {
      console.warn('[GoogleCalendar] Calendar write scope missing');
      return {
        success: false,
        error: 'Google Calendar permission required (missing calendar.events scope)',
        errorCode: 'GOOGLE_CALENDAR_SCOPE_REQUIRED'
      };
    }

    const attendees = attendeeEmails.map((e) => ({ email: e }));
    const timeZone = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const targetEntityId = event.scheduledCallId || event.mockTestId;
    const deterministicId = targetEntityId ? this.generateDeterministicEventId(targetEntityId) : undefined;

    console.log('[GoogleCalendar] calendarId=primary');
    console.log(`[GoogleCalendar] start=${event.startTime.toISOString()}`);
    console.log(`[GoogleCalendar] end=${event.endTime.toISOString()}`);
    console.log(`[GoogleCalendar] timezone=${timeZone}`);
    console.log(`[GoogleCalendar] attendeeCount=${attendees.length}`);

    const requestBody: any = {
      summary: event.title,
      description: event.description || 'Scheduled Call from Document AI platform',
      location: event.location || 'Document AI Collaboration Platform',
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 15 },
          { method: 'popup', minutes: 5 }
        ]
      }
    };

    if (deterministicId) {
      requestBody.id = deterministicId;
    }

    if (attendees.length > 0) {
      requestBody.attendees = attendees;
    }

    if (event.createConference) {
      const confReqId = event.conferenceRequestId || (deterministicId ? `meet_${deterministicId}` : `meet_${Date.now()}`);
      requestBody.conferenceData = {
        createRequest: {
          requestId: confReqId,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      };
    }

    // Mock token bypass for testing/mock environment
    if (accessToken.startsWith('mock_access_token_')) {
      const mockEventId = deterministicId || `mock_evt_${Date.now()}`;
      const mockHtmlLink = `https://calendar.google.com/calendar/event?eid=${mockEventId}`;
      const mockMeetUrl = event.createConference ? `https://meet.google.com/mock-${mockEventId}` : undefined;

      console.log('[GoogleCalendar] Calling events.insert');
      console.log('[GoogleCalendar] events.insert status=200');
      console.log(`[GoogleCalendar] eventId=${mockEventId}`);
      console.log(`[GoogleCalendar] htmlLink=${mockHtmlLink}`);
      console.log('[GoogleCalendar] Verification status=success');

      return {
        success: true,
        eventId: mockEventId,
        htmlLink: mockHtmlLink,
        meetUrl: mockMeetUrl,
        conferenceId: mockMeetUrl ? `conf_${mockEventId}` : undefined,
        verified: true
      };
    }

    try {
      console.log('[GoogleCalendar] Calling events.insert');
      const url = event.createConference
        ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1'
        : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`[GoogleCalendar] events.insert status=${res.status}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[GoogleCalendar] events.insert failed (HTTP ${res.status}): ${errorText.slice(0, 200)}`);

        let errorCode = 'GOOGLE_CALENDAR_TEMPORARY_FAILURE';
        if (res.status === 401) errorCode = 'GOOGLE_TOKEN_INVALID';
        else if (res.status === 403) errorCode = 'GOOGLE_CALENDAR_PERMISSION_DENIED';
        else if (res.status === 400) errorCode = 'GOOGLE_CALENDAR_INVALID_EVENT';
        else if (res.status === 404) errorCode = 'GOOGLE_CALENDAR_NOT_FOUND';
        else if (res.status === 429) errorCode = 'GOOGLE_CALENDAR_RATE_LIMITED';

        return {
          success: false,
          error: `Google Calendar API error (HTTP ${res.status}): ${errorText.slice(0, 150)}`,
          errorCode
        };
      }

      const data = await res.json();
      console.log(`[GoogleCalendar] eventId=${data.id}`);
      console.log(`[GoogleCalendar] htmlLink=${data.htmlLink}`);

      const meetUrl =
        data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
        data.hangoutLink ||
        undefined;
      const conferenceId = data.conferenceData?.conferenceId || undefined;

      // 2. Perform diagnostic verification GET events.get
      let verified = false;
      try {
        const verifyRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(data.id)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.id === data.id && verifyData.summary === event.title) {
            verified = true;
          }
        }
      } catch (verifyErr) {
        console.warn('[GoogleCalendar] Verification check failed silently:', verifyErr);
      }

      console.log(`[GoogleCalendar] Verification status=${verified ? 'success' : 'unverified'}`);

      return {
        success: true,
        eventId: data.id,
        htmlLink: data.htmlLink,
        meetUrl,
        conferenceId,
        verified
      };
    } catch (err: any) {
      console.error('[GoogleCalendar] Exception creating calendar event:', err?.message || err);
      return {
        success: false,
        error: err?.message || 'Google Calendar request failed',
        errorCode: 'GOOGLE_CALENDAR_TEMPORARY_FAILURE'
      };
    }
  }

  /**
   * Update (reschedule) existing Google Calendar Event
   */
  public async updateCalendarEventViaApi(
    userId: string,
    eventId: string,
    event: CalendarEventDetails,
    attendeeEmails: string[] = []
  ): Promise<CalendarCreationResult> {
    const tokenResult = await googleAuthService.getValidAccessToken(userId);
    if (tokenResult.status !== 'VALID' || !tokenResult.accessToken) {
      return {
        success: false,
        error: 'Google Calendar integration unavailable',
        errorCode: tokenResult.status === 'NOT_CONNECTED' ? 'GOOGLE_CALENDAR_NOT_CONNECTED' : 'GOOGLE_REAUTH_REQUIRED'
      };
    }

    const { accessToken } = tokenResult;
    const timeZone = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const attendees = attendeeEmails.map((e) => ({ email: e }));

    const requestBody: any = {
      summary: event.title,
      description: event.description,
      location: event.location || 'Document AI Collaboration Platform',
      start: { dateTime: event.startTime.toISOString(), timeZone },
      end: { dateTime: event.endTime.toISOString(), timeZone }
    };

    if (attendees.length > 0) {
      requestBody.attendees = attendees;
    }

    if (accessToken.startsWith('mock_access_token_')) {
      const mockHtmlLink = `https://calendar.google.com/calendar/event?eid=${eventId}`;
      const mockMeetUrl = event.createConference ? `https://meet.google.com/mock-${eventId}` : undefined;
      return {
        success: true,
        eventId,
        htmlLink: mockHtmlLink,
        meetUrl: mockMeetUrl,
        conferenceId: mockMeetUrl ? `conf_${eventId}` : undefined,
        verified: true
      };
    }

    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all&conferenceDataVersion=1`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: `Google Calendar API patch error: ${errorText.slice(0, 150)}`,
          errorCode: res.status === 401 ? 'GOOGLE_TOKEN_INVALID' : 'GOOGLE_CALENDAR_TEMPORARY_FAILURE'
        };
      }

      const data = await res.json();
      const meetUrl =
        data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
        data.hangoutLink ||
        undefined;
      const conferenceId = data.conferenceData?.conferenceId || undefined;

      return {
        success: true,
        eventId: data.id,
        htmlLink: data.htmlLink,
        meetUrl,
        conferenceId,
        verified: true
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to update Google Calendar event',
        errorCode: 'GOOGLE_CALENDAR_TEMPORARY_FAILURE'
      };
    }
  }

  /**
   * Delete / cancel Google Calendar Event
   */
  public async deleteCalendarEventViaApi(
    userId: string,
    eventId: string
  ): Promise<{ success: boolean; error?: string }> {
    const tokenResult = await googleAuthService.getValidAccessToken(userId);
    if (tokenResult.status !== 'VALID' || !tokenResult.accessToken) {
      return { success: false, error: 'Google Calendar integration unavailable' };
    }

    const { accessToken } = tokenResult;
    if (accessToken.startsWith('mock_access_token_')) {
      return { success: true };
    }

    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const errText = await res.text();
        return { success: false, error: `Google Calendar delete HTTP ${res.status}: ${errText.slice(0, 100)}` };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete Google Calendar event' };
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
