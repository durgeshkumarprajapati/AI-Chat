import { scheduledCallService } from '@/features/collaboration/scheduled-calls/scheduled-call.service';
import { scheduledCallRepository } from '@/features/collaboration/scheduled-calls/scheduled-call.repository';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';
import { workerCalendarSyncProcessor } from '../worker/src/processors/calendar-sync.processor';
import { prisma } from '@/lib/prisma';
import { ScheduledCallStatus, ScheduledCallType, CalendarSyncStatus } from '@prisma/client';

describe('Phase 55 — Production Scheduled Google Meet Calls in Collab Chat Tests', () => {
  let organizerUser: any;
  let memberUser: any;
  let outsiderUser: any;
  let directChannel: any;
  let groupChannel: any;

  beforeAll(async () => {
    // 1. Create or fetch test users
    organizerUser = await prisma.user.findFirst({ where: { email: 'phase55_organizer@example.com' } });
    if (!organizerUser) {
      organizerUser = await prisma.user.create({
        data: {
          email: 'phase55_organizer@example.com',
          name: 'Phase 55 Organizer',
          passwordHash: 'dummy_hash'
        }
      });
    }

    memberUser = await prisma.user.findFirst({ where: { email: 'phase55_member@example.com' } });
    if (!memberUser) {
      memberUser = await prisma.user.create({
        data: {
          email: 'phase55_member@example.com',
          name: 'Phase 55 Member',
          passwordHash: 'dummy_hash'
        }
      });
    }

    outsiderUser = await prisma.user.findFirst({ where: { email: 'phase55_outsider@example.com' } });
    if (!outsiderUser) {
      outsiderUser = await prisma.user.create({
        data: {
          email: 'phase55_outsider@example.com',
          name: 'Phase 55 Outsider',
          passwordHash: 'dummy_hash'
        }
      });
    }

    // 2. Setup mock Google Integration for organizer using googleAuthService
    await googleAuthService.saveGoogleTokens(
      organizerUser.id,
      `mock_access_token_${organizerUser.id}`,
      `mock_refresh_token_${organizerUser.id}`,
      'phase55_organizer@gmail.com',
      undefined,
      'https://www.googleapis.com/auth/calendar.events'
    );

    // 3. Create DIRECT channel between organizer and member
    directChannel = await collaborationService.getOrCreateDirectChannel(organizerUser.id, memberUser.id);

    // 4. Create GROUP channel
    groupChannel = await collaborationService.createGroupChannel(
      organizerUser.id,
      'Phase 55 Architecture Guild',
      'Group channel for scheduled call tests',
      [memberUser.id]
    );
  });

  beforeEach(async () => {
    // Cleanup scheduled calls created in earlier tests
    await prisma.scheduledCall.deleteMany({
      where: { channelId: { in: [directChannel.id, groupChannel.id] } }
    });
  });

  afterAll(async () => {
    await prisma.scheduledCall.deleteMany({
      where: { channelId: { in: [directChannel.id, groupChannel.id] } }
    });
    await prisma.googleIntegration.deleteMany({
      where: { userId: organizerUser.id }
    });
    await prisma.collabChannel.deleteMany({
      where: { id: { in: [directChannel.id, groupChannel.id] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [organizerUser.id, memberUser.id, outsiderUser.id] } }
    });
  });

  test('1. Schedule a 1-on-1 Google Meet Call in DIRECT channel', async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    tomorrow.setHours(14, 0, 0, 0);

    const scheduledCall = await scheduledCallService.createScheduledCall(organizerUser.id, {
      channelId: directChannel.id,
      title: '1-on-1 Sync Meeting',
      scheduledStartAt: tomorrow.toISOString(),
      durationMinutes: 30,
      timezone: 'UTC'
    });

    expect(scheduledCall).toBeDefined();
    expect(scheduledCall.title).toBe('1-on-1 Sync Meeting');
    expect(scheduledCall.callType).toBe(ScheduledCallType.ONE_TO_ONE);
    expect(scheduledCall.status).toBe(ScheduledCallStatus.SCHEDULED);
    expect(scheduledCall.participants.length).toBe(2);

    // Verify Google Meet link generation
    expect(scheduledCall.googleMeetUrl).toContain('meet.google.com');
    expect(scheduledCall.calendarSyncStatus).toBe(CalendarSyncStatus.SYNCED);

    // Verify automated system message created in Collab Chat
    const chatMsg = await prisma.collabMessage.findFirst({
      where: { scheduledCallId: scheduledCall.id }
    });
    expect(chatMsg).toBeDefined();
    expect(chatMsg?.messageType).toBe('SCHEDULED_CALL');
    expect(chatMsg?.content).toContain('1-on-1 Sync Meeting');
  });

  test('2. Schedule a Group Google Meet Call in GROUP channel with multiple attendees', async () => {
    const futureDate = new Date(Date.now() + 48 * 3600 * 1000);
    futureDate.setHours(10, 30, 0, 0);

    const scheduledCall = await scheduledCallService.createScheduledCall(organizerUser.id, {
      channelId: groupChannel.id,
      title: 'Sprint Planning & Tech Design',
      scheduledStartAt: futureDate.toISOString(),
      durationMinutes: 60,
      timezone: 'Asia/Kolkata'
    });

    expect(scheduledCall).toBeDefined();
    expect(scheduledCall.callType).toBe(ScheduledCallType.GROUP);
    expect(scheduledCall.durationMinutes).toBe(60);
    expect(scheduledCall.timezone).toBe('Asia/Kolkata');
    expect(scheduledCall.googleMeetUrl).toBeDefined();
    expect(scheduledCall.googleCalendarEventId).toBeDefined();

    // Verify participants count
    expect(scheduledCall.participants.length).toBe(2);
  });

  test('3. Reschedule an existing call and verify Google Meet URL & event details stay in sync', async () => {
    const initialStart = new Date(Date.now() + 24 * 3600 * 1000);
    const createdCall = await scheduledCallService.createScheduledCall(organizerUser.id, {
      channelId: directChannel.id,
      title: 'Initial Meeting Title',
      scheduledStartAt: initialStart.toISOString(),
      durationMinutes: 30
    });

    const newStart = new Date(Date.now() + 72 * 3600 * 1000);
    newStart.setHours(16, 0, 0, 0);

    const rescheduled = await scheduledCallService.rescheduleCall(organizerUser.id, createdCall.id, {
      title: 'Rescheduled Sync Meeting',
      scheduledStartAt: newStart.toISOString(),
      durationMinutes: 45
    });

    expect(rescheduled.title).toBe('Rescheduled Sync Meeting');
    expect(rescheduled.durationMinutes).toBe(45);
    expect(new Date(rescheduled.scheduledStartAt).getTime()).toBe(newStart.getTime());
    expect(rescheduled.googleMeetUrl).toBeDefined();
  });

  test('4. Cancel a scheduled call soft deletes call and releases Google Meet meeting', async () => {
    const futureStart = new Date(Date.now() + 24 * 3600 * 1000);
    const callToCancel = await scheduledCallService.createScheduledCall(organizerUser.id, {
      channelId: directChannel.id,
      title: 'Call To Be Cancelled',
      scheduledStartAt: futureStart.toISOString(),
      durationMinutes: 30
    });

    const cancelledCall = await scheduledCallService.cancelCall(organizerUser.id, callToCancel.id);

    expect(cancelledCall.status).toBe(ScheduledCallStatus.CANCELLED);
    expect(cancelledCall.calendarSyncStatus).toBe(CalendarSyncStatus.CANCELLED);
    expect(cancelledCall.cancelledAt).toBeDefined();
    expect(cancelledCall.cancelledById).toBe(organizerUser.id);
  });

  test('5. Worker Processor retries PENDING and RETRY_PENDING ScheduledCall jobs', async () => {
    // Create a call manually in PENDING state without sync
    const callRecord = await scheduledCallRepository.createScheduledCall({
      channelId: directChannel.id,
      createdById: organizerUser.id,
      title: 'Worker Sync Test Call',
      callType: ScheduledCallType.ONE_TO_ONE,
      scheduledStartAt: new Date(Date.now() + 24 * 3600 * 1000),
      scheduledEndAt: new Date(Date.now() + 24 * 3600 * 1000 + 1800 * 1000),
      durationMinutes: 30,
      timezone: 'UTC',
      participantUserIds: [{ userId: organizerUser.id, email: organizerUser.email }]
    });

    expect(callRecord.calendarSyncStatus).toBe(CalendarSyncStatus.PENDING);

    // Run background worker processor
    const result = await workerCalendarSyncProcessor.processPendingAndRetryJobs();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Verify call was updated to SYNCED
    const updatedCall = await scheduledCallRepository.findById(callRecord.id);
    expect(updatedCall?.calendarSyncStatus).toBe(CalendarSyncStatus.SYNCED);
    expect(updatedCall?.googleMeetUrl).toContain('meet.google.com');
  });

  test('6. Security & Authorization: Non-members cannot schedule, reschedule, or cancel calls', async () => {
    const futureStart = new Date(Date.now() + 24 * 3600 * 1000);

    // Outsider trying to schedule call in channel they don't belong to
    await expect(
      scheduledCallService.createScheduledCall(outsiderUser.id, {
        channelId: directChannel.id,
        title: 'Unauthorized Call',
        scheduledStartAt: futureStart.toISOString()
      })
    ).rejects.toThrow();

    // Create a valid call first
    const validCall = await scheduledCallService.createScheduledCall(organizerUser.id, {
      channelId: directChannel.id,
      title: 'Valid Member Call',
      scheduledStartAt: futureStart.toISOString()
    });

    // Outsider trying to reschedule
    await expect(
      scheduledCallService.rescheduleCall(outsiderUser.id, validCall.id, {
        scheduledStartAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
      })
    ).rejects.toThrow();

    // Outsider trying to cancel
    await expect(scheduledCallService.cancelCall(outsiderUser.id, validCall.id)).rejects.toThrow();
  });
});
