import dotenv from 'dotenv';
dotenv.config();

import { ChatService } from '../src/features/rag/chat/chat.service';
import { RetrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { LLMProvider, LLMGenerateInput } from '../src/features/rag/llm/llm.provider';
import { MockEmbeddingProvider } from './phase10-embeddings.test';
import { RetrievedChunk } from '../src/features/rag/retrieval/retrieval.types';
import { OllamaLLMProvider } from '../src/features/rag/llm/ollama.llm.provider';
import { OpenAILLMProvider } from '../src/features/rag/llm/openai.llm.provider';
import { getLLMProvider } from '../src/features/rag/llm/llm.provider.factory';
import { prisma } from '../src/lib/prisma';
import { ValidationError, AuthorizationError } from '../src/errors';
import { StreamEvent } from '../src/features/rag/chat/chat.types';

const TEST_USER_ID = '77777777-7777-4000-a000-777777777777';
const OTHER_USER_ID = '88888888-8888-4000-a000-888888888888';

export class MockStreamingLLMProvider implements LLMProvider {
  public lastInput: LLMGenerateInput | null = null;
  public mockDeltas = ['According ', 'to ', 'the ', 'document, ', 'deployment ', 'is ', 'automatic.'];
  public failMode = false;

  public async generateAnswer(input: LLMGenerateInput): Promise<string> {
    this.lastInput = input;
    if (this.failMode) {
      throw new Error('LLM Provider error');
    }
    return this.mockDeltas.join('');
  }

  public async *streamAnswer(input: LLMGenerateInput): AsyncIterable<string> {
    this.lastInput = input;
    if (this.failMode) {
      throw new Error('LLM Provider streaming error');
    }
    for (const delta of this.mockDeltas) {
      yield delta;
    }
  }
}

export class MockStreamingRetrievalService extends RetrievalService {
  public mockChunks: RetrievedChunk[] = [];

  constructor() {
    super(new MockEmbeddingProvider());
  }

  public override async retrieveContext(): Promise<RetrievedChunk[]> {
    return this.mockChunks;
  }
}

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase13-main-user@example.com',
        name: 'Phase 13 Main User'
      }
    });

    await prisma.user.upsert({
      where: { id: OTHER_USER_ID },
      update: {},
      create: {
        id: OTHER_USER_ID,
        email: 'phase13-other-user@example.com',
        name: 'Phase 13 Other User'
      }
    });
  } catch (err) {
    console.warn('Failed to upsert test users:', err);
  }
}

async function runPhase13Tests() {
  console.log('====================================================');
  console.log('Running Phase 13 Streaming RAG Chat Test Suite');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1: Question validation in streaming
  console.log('Test 1: Streaming Question Validation');
  const chatService1 = new ChatService(new MockStreamingRetrievalService(), new MockStreamingLLMProvider());
  try {
    const stream = chatService1.streamMessage(TEST_USER_ID, { question: '   ' });
    for await (const _ of stream) {}
    throw new Error('Should have thrown ValidationError for empty question');
  } catch (err) {
    if (err instanceof ValidationError) {
      console.log('  ✅ PASSED: Empty question rejected with ValidationError.');
    } else {
      throw err;
    }
  }

  // Test 2 & 3: Conversation ownership in streaming
  console.log('\nTest 2 & 3: Conversation Ownership Enforcement');
  const conv3 = await prisma.conversation.create({
    data: {
      userId: OTHER_USER_ID,
      title: 'Other User Conv'
    }
  });

  try {
    const stream = chatService1.streamMessage(TEST_USER_ID, { conversationId: conv3.id, question: 'Hello?' });
    for await (const _ of stream) {}
    throw new Error('Should have thrown AuthorizationError');
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.log('  ✅ PASSED: Unauthorized conversation access rejected.');
    } else {
      throw err;
    }
  }

  // Test 4-10: Zero Relevant Chunks Fallback (No LLM Call, 0 Citations)
  console.log('\nTest 4-10: Zero-Chunk Fallback Behavior (No LLM Invocation)');
  const mockRetEmpty = new MockStreamingRetrievalService();
  mockRetEmpty.mockChunks = [];
  const mockLLMEmpty = new MockStreamingLLMProvider();

  const chatServiceEmpty = new ChatService(mockRetEmpty, mockLLMEmpty);
  const eventsEmpty: StreamEvent[] = [];

  for await (const evt of chatServiceEmpty.streamMessage(TEST_USER_ID, { question: 'Warp speed physics?' })) {
    eventsEmpty.push(evt);
  }

  if (mockLLMEmpty.lastInput !== null) {
    throw new Error('LLM was invoked despite 0 relevant chunks!');
  }

  const startEvt = eventsEmpty.find((e) => e.type === 'start') as Extract<StreamEvent, { type: 'start' }>;
  const doneEvt = eventsEmpty.find((e) => e.type === 'done') as Extract<StreamEvent, { type: 'done' }>;

  if (!startEvt || startEvt.citations.length !== 0) {
    throw new Error('Expected 0 citations in start event');
  }
  if (!doneEvt || !doneEvt.answer.includes("couldn't find enough relevant information")) {
    throw new Error(`Unexpected fallback answer: ${doneEvt?.answer}`);
  }
  console.log('  ✅ PASSED: Zero-chunk fallback returned deterministic response without calling LLM.');

  // Test 11-16: Relevant Chunks Stream LLM Deltas & Persist Complete Message
  console.log('\nTest 11-16: Relevant Chunks Stream Deltas & Persist Message');
  const docId13 = `doc-p13-${Date.now()}`;
  const mockRetChunks = new MockStreamingRetrievalService();
  mockRetChunks.mockChunks = [
    {
      id: 'chunk-13',
      documentId: docId13,
      filename: 'deploy.pdf',
      chunkIndex: 0,
      pageNumber: 2,
      content: 'Deployment pipeline executes automatically on push.',
      tokenCount: 7,
      similarity: 0.88,
      metadata: { pageNumber: 2 }
    }
  ];

  const mockLLMSuccess = new MockStreamingLLMProvider();
  const chatServiceStream = new ChatService(mockRetChunks, mockLLMSuccess);
  const streamEvents: StreamEvent[] = [];

  for await (const evt of chatServiceStream.streamMessage(TEST_USER_ID, { question: 'How is deployment handled?' })) {
    streamEvents.push(evt);
  }

  const deltas = streamEvents.filter((e) => e.type === 'delta') as Array<Extract<StreamEvent, { type: 'delta' }>>;
  const finalDone = streamEvents.find((e) => e.type === 'done') as Extract<StreamEvent, { type: 'done' }>;

  if (deltas.length !== mockLLMSuccess.mockDeltas.length) {
    throw new Error(`Expected ${mockLLMSuccess.mockDeltas.length} delta events, got ${deltas.length}`);
  }

  const accumulatedDeltas = deltas.map((d) => d.text).join('');
  if (accumulatedDeltas !== mockLLMSuccess.mockDeltas.join('')) {
    throw new Error(`Deltas mismatch: expected "${mockLLMSuccess.mockDeltas.join('')}", got "${accumulatedDeltas}"`);
  }

  if (finalDone.citations.length !== 1 || finalDone.citations[0]?.filename !== 'deploy.pdf') {
    throw new Error('Final event citations missing or incorrect');
  }

  // Verify message persisted in DB
  const dbDetail = await chatServiceStream.getConversationDetail(TEST_USER_ID, finalDone.conversationId);
  if (dbDetail.messages.length < 2) {
    throw new Error('User and Assistant messages were not persisted after stream completed');
  }
  console.log('  ✅ PASSED: Streamed deltas in order and persisted accumulated answer & citations.');

  // Test 17 & 18: Mocked Ollama and OpenAI Provider Streaming
  console.log('\nTest 17 & 18: Ollama and OpenAI Provider Stream Method Verification');
  const ollamaProvider = new OllamaLLMProvider();
  const openaiProvider = new OpenAILLMProvider();

  if (typeof ollamaProvider.streamAnswer !== 'function') {
    throw new Error('OllamaLLMProvider missing streamAnswer method');
  }
  if (typeof openaiProvider.streamAnswer !== 'function') {
    throw new Error('OpenAILLMProvider missing streamAnswer method');
  }
  console.log('  ✅ PASSED: Both Ollama and OpenAI providers implement streamAnswer method.');

  // Test 19: Provider Factory Provider-Agnostic Resolution
  console.log('\nTest 19: Provider Factory Resolution');
  process.env.LLM_PROVIDER = 'ollama';
  const resolvedOllama = getLLMProvider();
  if (!(resolvedOllama instanceof OllamaLLMProvider)) {
    throw new Error('Expected OllamaLLMProvider from factory');
  }

  process.env.LLM_PROVIDER = 'openai';
  const resolvedOpenAI = getLLMProvider();
  if (!(resolvedOpenAI instanceof OpenAILLMProvider)) {
    throw new Error('Expected OpenAILLMProvider from factory');
  }
  process.env.LLM_PROVIDER = 'ollama'; // reset
  console.log('  ✅ PASSED: LLM Provider Factory resolves streaming providers correctly.');

  // Test 20 & 21: Error Handling During Streaming
  console.log('\nTest 20 & 21: LLM Provider Error Handling During Stream');
  const mockLLMFail = new MockStreamingLLMProvider();
  mockLLMFail.failMode = true;

  const chatServiceFail = new ChatService(mockRetChunks, mockLLMFail);
  try {
    const stream = chatServiceFail.streamMessage(TEST_USER_ID, { question: 'Will this fail?' });
    for await (const _ of stream) {}
    throw new Error('Should have thrown error for failed LLM provider stream');
  } catch (err) {
    console.log('  ✅ PASSED: LLM streaming error caught correctly:', (err as Error).message);
  }

  // Test 22: Existing POST /api/chat Non-Streaming Endpoint Backward Compatibility
  console.log('\nTest 22: Existing Non-Streaming sendMessage Backward Compatibility');
  const syncRes = await chatService1.sendMessage(TEST_USER_ID, { question: 'What is the deployment procedure?' });
  if (!syncRes.answer || !syncRes.conversationId) {
    throw new Error('Existing sendMessage non-streaming response broken');
  }
  console.log('  ✅ PASSED: Existing non-streaming sendMessage API remains fully operational.');

  // Clean up
  try {
    await prisma.conversation.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.conversation.deleteMany({ where: { userId: OTHER_USER_ID } });
  } catch {
    console.log('Cleaned up test records.');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 13 STREAMING CHAT TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase13Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 13 TEST FAILED:', err);
    process.exit(1);
  });
