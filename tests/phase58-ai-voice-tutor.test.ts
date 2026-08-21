import { voiceTutorSessionService } from '../src/features/voice-tutor/voice-tutor.session.service';
import { voiceTutorService } from '../src/features/voice-tutor/voice-tutor.service';
import { voiceTutorFeedbackService } from '../src/features/voice-tutor/voice-tutor.feedback.service';
import { AudioValidationError, UnauthorizedSessionError } from '../src/features/voice-tutor/voice-tutor.errors';
import { VoiceTutorSessionStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { llmGateway } from '../src/features/llm/llm-gateway.service';

describe('Phase 58 — Production AI Voice Tutor Tests', () => {
  jest.setTimeout(30000);

  let user1: any;
  let user2: any;

  beforeAll(async () => {
    // Mock LLM Gateway response to run instantaneously without requiring external Ollama service
    jest.spyOn(llmGateway, 'generate').mockImplementation(async (_req: any) => {
      return {
        id: 'mock-llm-id',
        text: 'B-Tree indexes speed up lookups by organizing data in a balanced search tree.',
        provider: 'mock',
        model: 'mock-model',
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 }
      } as any;
    });

    // Create test users
    user1 = await prisma.user.create({
      data: {
        email: `phase58_user1_${Date.now()}@example.com`,
        name: 'Phase 58 Learner One',
        role: 'USER'
      }
    });

    user2 = await prisma.user.create({
      data: {
        email: `phase58_user2_${Date.now()}@example.com`,
        name: 'Phase 58 Learner Two',
        role: 'USER'
      }
    });
  });

  afterAll(async () => {
    // Teardown test users and sessions
    await prisma.voiceTutorSession.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  test('1. Session Lifecycle: Create, Pause, Resume, and List User Sessions', async () => {
    const session = await voiceTutorSessionService.createSession(user1.id, {
      title: 'Database Sharding & Optimization',
      mode: 'FREE_TUTOR'
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user1.id);
    expect(session.status).toBe(VoiceTutorSessionStatus.ACTIVE);
    expect(session.title).toBe('Database Sharding & Optimization');

    // Pause session
    const paused = await voiceTutorSessionService.pauseSession(session.id, user1.id);
    expect(paused.status).toBe(VoiceTutorSessionStatus.PAUSED);

    // Resume session
    const resumed = await voiceTutorSessionService.resumeSession(session.id, user1.id);
    expect(resumed.status).toBe(VoiceTutorSessionStatus.ACTIVE);

    // List user sessions
    const { sessions, total } = await voiceTutorSessionService.listUserSessions(user1.id);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(sessions.some((s) => s.id === session.id)).toBe(true);
  });

  test('2. Audio Input Validation: Rejects empty, oversized, or unsupported MIME types', async () => {
    // Empty audio buffer
    expect(() => {
      voiceTutorService.validateAudioInput(Buffer.alloc(0), 'audio/webm');
    }).toThrow(AudioValidationError);

    // Unsupported MIME type
    expect(() => {
      voiceTutorService.validateAudioInput(Buffer.from('fake_audio'), 'application/executable');
    }).toThrow(AudioValidationError);

    // Valid audio payload
    expect(() => {
      voiceTutorService.validateAudioInput(Buffer.from('VALID_PCM_AUDIO_DATA_FOR_TESTING'), 'audio/webm');
    }).not.toThrow();
  });

  test('3. Voice Interaction Turn Execution: STT -> RAG/Context -> LLM Gateway -> TTS', async () => {
    const session = await voiceTutorSessionService.createSession(user1.id, {
      title: 'PostgreSQL Indexing Deep Dive',
      mode: 'DOCUMENT_TUTOR'
    });

    const mockAudioPayload = Buffer.from('TEST_TRANSCRIPT: Explain how B-Tree indexes improve query speed.');

    const turnResult = await voiceTutorService.processTurn({
      sessionId: session.id,
      userId: user1.id,
      audioBuffer: mockAudioPayload,
      audioMimeType: 'audio/webm',
      clientRequestId: `req_${Date.now()}`
    });

    expect(turnResult.sessionId).toBe(session.id);
    expect(turnResult.userMessage.text).toContain('B-Tree indexes');
    expect(turnResult.tutorMessage.text).toBeDefined();
    expect(turnResult.tutorMessage.role).toBe('ASSISTANT');
    expect(turnResult.audioBuffer).toBeDefined();
    expect(turnResult.audioMimeType).toBe('audio/mp3');

    // Verify DB records
    const updatedSession = await voiceTutorSessionService.getSession(session.id, user1.id);
    expect(updatedSession.totalMessages).toBe(2);
    expect(updatedSession.messages?.length).toBe(2);
  });

  test('4. Post-Session Feedback Generation & Recommended Mock Test', async () => {
    const session = await voiceTutorSessionService.createSession(user1.id, {
      title: 'Database Systems & Sharding',
      mode: 'FREE_TUTOR'
    });

    // Add a user and assistant turn
    await voiceTutorService.processTurn({
      sessionId: session.id,
      userId: user1.id,
      textInput: 'Explain database sharding and index optimization.'
    });

    // Complete session and generate learning feedback
    await voiceTutorSessionService.completeSession(session.id, user1.id);
    const feedback = await voiceTutorFeedbackService.generateFeedback(session.id, user1.id);

    expect(feedback.sessionId).toBe(session.id);
    expect(feedback.userId).toBe(user1.id);
    expect(feedback.understandingScore).toBeGreaterThanOrEqual(50);
    expect(feedback.communicationScore).toBeGreaterThanOrEqual(50);
    expect(feedback.conceptsDiscussed.length).toBeGreaterThan(0);
    expect(feedback.recommendedMockTestTopic).toBeDefined();
  });

  test('5. Authorization & Tenant Security Boundaries: Reject cross-user session access', async () => {
    const session1 = await voiceTutorSessionService.createSession(user1.id, {
      title: 'Private User 1 Session'
    });

    // User 2 attempts to fetch User 1 session -> Unauthorized
    await expect(
      voiceTutorSessionService.getSession(session1.id, user2.id)
    ).rejects.toThrow(UnauthorizedSessionError);

    // User 2 attempts to submit turn to User 1 session -> Unauthorized
    await expect(
      voiceTutorService.processTurn({
        sessionId: session1.id,
        userId: user2.id,
        textInput: 'Attempted unauthorized turn'
      })
    ).rejects.toThrow(UnauthorizedSessionError);
  });
});
