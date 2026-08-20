import { prisma } from '@/lib/prisma';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { collabCallService } from '@/features/collaboration/call.service';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import { CallStatus } from '@prisma/client';

describe('Phase 49 — Scheduled AI Mock Tests & Calling Master Integration Tests', () => {
  let testUser: any;

  beforeAll(async () => {
    testUser = await prisma.user.upsert({
      where: { email: 'phase49_tester@example.com' },
      create: {
        email: 'phase49_tester@example.com',
        name: 'Phase 49 Tester',
        passwordHash: 'hash'
      },
      update: {}
    });
  });

  test('1. Schedules AI Mock Test, generates Google Calendar link & .ics export', async () => {
    const futureTime = new Date(Date.now() + 2 * 3600 * 1000);
    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Integration Test Architecture Exam',
      topic: 'Distributed Systems',
      scheduledStartTime: futureTime,
      durationMinutes: 45,
      totalQuestions: 5
    });

    expect(mockTest.id).toBeDefined();
    expect(mockTest.title).toBe('Integration Test Architecture Exam');
    expect(mockTest.googleCalendarLink).toContain('https://calendar.google.com');

    const details = await scheduledMockTestService.getMockTestDetails(mockTest.id, testUser.id);
    expect(details.mockTest.id).toBe(mockTest.id);
    expect(details.isExpired).toBe(false);

    const icsContent = googleCalendarService.generateICalendarFile({
      title: mockTest.title,
      startTime: futureTime,
      endTime: new Date(futureTime.getTime() + 45 * 60 * 1000)
    });
    expect(icsContent).toContain('BEGIN:VCALENDAR');
    expect(icsContent).toContain('SUMMARY:Integration Test Architecture Exam');
  }, 20000);

  test('2. Voice/Video Call Signaling Relay via PubSub SSE', async () => {
    const channel = await prisma.collabChannel.create({
      data: {
        createdById: testUser.id,
        type: 'DIRECT',
        members: {
          create: [{ userId: testUser.id, role: 'OWNER' }]
        }
      }
    });

    const publishedEvts: any[] = [];
    const unsubscribe = collabPubSubService.subscribe(channel.id, (evt) => {
      publishedEvts.push(evt);
    });

    const call = await collabCallService.initiateCall(testUser.id, {
      channelId: channel.id,
      type: 'VOICE'
    });

    expect(call.id).toBeDefined();
    expect(call.status).toBe(CallStatus.RINGING);
    expect(publishedEvts.some((e) => e.type === 'call:invite')).toBe(true);

    await collabCallService.handleCallAction(call.id, testUser.id, 'accept');
    expect(publishedEvts.some((e) => e.type === 'call:accept')).toBe(true);

    await collabCallService.handleCallAction(call.id, testUser.id, 'end');
    expect(publishedEvts.some((e) => e.type === 'call:end')).toBe(true);

    unsubscribe();

    // Clean up channel and call
    await prisma.collabCall.deleteMany({ where: { channelId: channel.id } });
    await prisma.collabChannel.delete({ where: { id: channel.id } });
  });
});
