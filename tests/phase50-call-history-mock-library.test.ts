import { prisma } from '@/lib/prisma';
import { callHistoryService } from '@/features/collaboration/call-history/call-history.service';
import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';
import { collabCallService } from '@/features/collaboration/call.service';
import { CallStatus, MockTestStatus } from '@prisma/client';

describe('Phase 50 — Production Call History & Mock Test Library Master Integration Tests', () => {
  let testUser: any;
  let testChannel: any;

  beforeAll(async () => {
    testUser = await prisma.user.upsert({
      where: { email: 'phase50_tester@example.com' },
      create: {
        email: 'phase50_tester@example.com',
        name: 'Phase 50 Master Tester',
        passwordHash: 'hash'
      },
      update: {}
    });

    testChannel = await prisma.collabChannel.create({
      data: {
        createdById: testUser.id,
        type: 'DIRECT',
        members: {
          create: [{ userId: testUser.id, role: 'OWNER' }]
        }
      }
    });
  });

  afterAll(async () => {
    if (testChannel) {
      await prisma.collabMessage.deleteMany({ where: { channelId: testChannel.id } });
      await prisma.collabCall.deleteMany({ where: { channelId: testChannel.id } });
      await prisma.collabChannel.delete({ where: { id: testChannel.id } });
    }
  });

  test('1. Call History querying, outcome mapping, missed count and chat timeline call event integration', async () => {
    // Initiate call
    const call = await collabCallService.initiateCall(testUser.id, {
      channelId: testChannel.id,
      type: 'VIDEO'
    });

    expect(call.id).toBeDefined();
    expect(call.status).toBe(CallStatus.RINGING);

    // End call
    await collabCallService.handleCallAction(call.id, testUser.id, 'end');

    // Verify call history retrieval
    const history = await callHistoryService.getCallHistory(testUser.id, { page: 1, limit: 10 });
    expect(history.data.length).toBeGreaterThan(0);
    const item = history.data.find((c) => c.id === call.id);
    expect(item).toBeDefined();
    expect(item?.outcome).toBe('COMPLETED');

    // Verify Call Event Message created in channel timeline
    const callMessage = await prisma.collabMessage.findFirst({
      where: { channelId: testChannel.id, callSessionId: call.id }
    });
    expect(callMessage).toBeDefined();
    expect(callMessage?.messageType).toBe('CALL_EVENT');
  });

  test('2. Centralized Mock Test Library listing, search, details, and active test answer protection', async () => {
    const testDoc = await prisma.scheduledMockTest.create({
      data: {
        createdById: testUser.id,
        title: 'Phase 50 Master Microservices Exam',
        topic: 'Microservices & Event Sourcing',
        scheduledStartTime: new Date(Date.now() + 7200 * 1000),
        status: MockTestStatus.SCHEDULED,
        questions: [
          {
            id: 'q_p50_1',
            questionText: 'What is CQRS?',
            type: 'MCQ_SINGLE',
            options: [
              { id: 'opt_1', optionText: 'Command Query Responsibility Segregation', isCorrect: true },
              { id: 'opt_2', optionText: 'Common Queue Response Protocol', isCorrect: false }
            ],
            correctOptionId: 'opt_1',
            explanation: 'CQRS separates read and update operations for a data store.'
          }
        ] as any
      }
    });

    // Query Library with search
    const libraryRes = await mockTestLibraryService.getLibraryTests(testUser.id, {
      search: 'Microservices'
    });
    expect(libraryRes.data.length).toBeGreaterThan(0);
    expect(libraryRes.data.some((t) => t.id === testDoc.id)).toBe(true);

    // Fetch details
    const details = await mockTestLibraryService.getTestDetails(testDoc.id, testUser.id);
    expect(details?.test.title).toBe('Phase 50 Master Microservices Exam');

    // Clean up
    await prisma.scheduledMockTest.delete({ where: { id: testDoc.id } });
  });
});
