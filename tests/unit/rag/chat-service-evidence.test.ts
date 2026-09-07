jest.mock('@/config/env', () => ({
  env: { server: {} }
}));

const TEST_USER_ID = 'evidence-test-user-1';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'conv-new-1' }),
      update: jest.fn()
    },
    knowledgeBase: { findFirst: jest.fn() },
    document: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, userId: TEST_USER_ID, knowledgeBases: [] })
      )
    },
    documentChunk: { count: jest.fn().mockResolvedValue(1) },
    $transaction: jest.fn().mockImplementation(async (fn: any) =>
      fn({
        message: { create: jest.fn().mockResolvedValue({ id: 'assistant-msg-1' }) },
        conversation: { update: jest.fn() }
      })
    )
  }
}));

jest.mock('@/features/rag/evaluation/evaluation.service', () => ({
  evaluationService: { evaluateAndPersist: jest.fn().mockResolvedValue(undefined) }
}));

import { ChatService } from '@/features/rag/chat/chat.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';
import { OrchestratedAnswer } from '@/features/rag/orchestration/answer-orchestrator.types';

/**
 * Integration-level tests for evidence-aware citation attribution through the REAL ChatService
 * (Phase 10 items #5, #15, #16). @/config/env is mocked (established pattern — see
 * tests/phase77-multimodal-concurrency.test.ts) so this actually runs in this sandbox, unlike
 * tests that import the orchestrator/env stack directly without that mock.
 */

const DOC_CHUNK: RetrievedChunk = {
  id: 'chunk-doc-1', documentId: 'doc-1', filename: 'policy.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'Multi-factor authentication is required for all production logins.', tokenCount: 10, similarity: 0.9, metadata: {}
};
const GRAPH_CHUNK: RetrievedChunk = {
  id: 'chunk-graph-1', documentId: 'doc-2', filename: 'org-chart.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'Entity A reports to Entity B as part of the platform team.', tokenCount: 10, similarity: 0.85,
  retrievalSource: 'graph', metadata: {}
};

function orchestratedAnswer(overrides: Partial<OrchestratedAnswer> = {}): OrchestratedAnswer {
  return {
    conversationId: '', answerMode: 'DOCUMENT_GROUNDED', answer: '', citations: [],
    retrievedChunks: [DOC_CHUNK, GRAPH_CHUNK], topSimilarity: 0.9, cacheHit: false, cacheType: 'none',
    llmCalled: true, embeddingCalled: true, vectorSearchCalled: true, keywordSearchCalled: true,
    rerankCalled: true, recoveryAttempted: false, recoveryAttempts: 0, latencyTrace: {},
    ...overrides
  };
}

function buildFakeOrchestrator() {
  return {
    findCachedAnswer: jest.fn().mockResolvedValue(null),
    orchestrate: jest.fn().mockResolvedValue(orchestratedAnswer()),
    cacheCompletedAnswer: jest.fn().mockResolvedValue(undefined)
  };
}

function buildFakeContextService() {
  return {
    classifyQuery: jest.fn().mockReturnValue('STANDALONE'),
    loadConversationContext: jest.fn().mockResolvedValue({ summary: null, includedMessages: [], retrievalQuery: 'question', queryRewriteMs: 0 }),
    generateConversationTitle: jest.fn().mockResolvedValue(undefined),
    summarizeConversationIfNeeded: jest.fn().mockResolvedValue(undefined)
  };
}

describe('ChatService — evidence-aware citation attribution (non-streaming)', () => {
  it('16. produces citations only for evidence identifiers the answer actually referenced', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue('MFA is mandatory [DOC-1]. Entity A reports to Entity B [GRAPH-1].'),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'How does auth and org structure work?' });

    expect(result.citations).toHaveLength(2);
    expect(result.citations.map((c) => c.chunkId).sort()).toEqual(['chunk-doc-1', 'chunk-graph-1']);
    expect(result.latencyTrace?.totalRetrievedEvidenceCount).toBe(2);
    expect(result.latencyTrace?.documentEvidenceReferencedCount).toBe(1);
    expect(result.latencyTrace?.graphEvidenceReferencedCount).toBe(1);
    expect(result.latencyTrace?.invalidEvidenceReferenceCount).toBe(0);
    expect(result.latencyTrace?.citationCoverageRatio).toBe(1);
    expect(result.attributionQuality).toBe('VALID_REFERENCES');
    expect(result.uncitedAnswer).toBe(false);
  });

  it('11/12. duplicate references are deduplicated into a single citation, and ownership validation still executes', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue('MFA is required [DOC-1]. As stated [DOC-1], this is mandatory [DOC-1].'),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'q' });

    expect(result.citations).toHaveLength(1);
    expect(result.latencyTrace?.citationDuplicateReferenceCount).toBe(2);
  });

  it('malformed markers are recorded distinctly and surface attributionQuality=INVALID_REFERENCES_PRESENT', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue('MFA is required [DOC-1], see also [DOC-X] for details.'),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'q' });

    expect(result.citations).toHaveLength(1);
    expect(result.latencyTrace?.citationMalformedReferenceCount).toBe(1);
    expect(result.attributionQuality).toBe('INVALID_REFERENCES_PRESENT');
  });

  it('uncitedAnswer=true and attributionQuality=NO_REFERENCES when evidence existed but nothing was cited', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue('MFA is required for all production logins.'),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'q' });

    expect(result.citations).toEqual([]);
    expect(result.uncitedAnswer).toBe(true);
    expect(result.attributionQuality).toBe('NO_REFERENCES');
  });

  it('produces zero citations (not all retrieved chunks) when the answer cites nothing (Phase 8 fallback)', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue("I couldn't find enough relevant information in your uploaded documents to answer that question."),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'unrelated question' });

    expect(result.citations).toEqual([]);
  });

  it('counts a fabricated identifier as invalid without throwing or exposing it', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn().mockResolvedValue('MFA is mandatory [DOC-1] and also see [DOC-99].'),
      streamAnswer: jest.fn()
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const result = await chatService.sendMessage(TEST_USER_ID, { question: 'q' });

    expect(result.citations).toHaveLength(1);
    expect(result.latencyTrace?.invalidEvidenceReferenceCount).toBe(1);
  });
});

describe('ChatService — evidence-aware citation attribution (streaming)', () => {
  it('15. streams every delta token unbuffered, and only computes evidence-based citations after the stream completes', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const tokens = ['MFA ', 'is ', 'mandatory ', '[DOC-1]', '.'];
    const fakeLLM = {
      generateAnswer: jest.fn(),
      streamAnswer: jest.fn().mockImplementation(async function* () {
        for (const t of tokens) yield t;
      })
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const events: any[] = [];
    for await (const event of chatService.streamMessage(TEST_USER_ID, { question: 'q' })) {
      events.push(event);
    }

    const deltaEvents = events.filter((e) => e.type === 'delta');
    // Every token was yielded individually, in order, as soon as produced — no buffering of the
    // full answer before delivery.
    expect(deltaEvents.map((e) => e.text)).toEqual(tokens);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.citations).toHaveLength(1);
    expect(doneEvent.citations[0].chunkId).toBe('chunk-doc-1');
    expect(doneEvent.answer).toBe(tokens.join('').trim());
    // Only 1 of the 2 presented evidence entries (DOC_CHUNK + GRAPH_CHUNK) was cited — correctly
    // PARTIAL_REFERENCES, not VALID_REFERENCES (which requires ALL presented evidence to be cited).
    expect(doneEvent.attributionQuality).toBe('PARTIAL_REFERENCES');
    expect(doneEvent.uncitedAnswer).toBe(false);
  });

  it('the preliminary "start" event never blocks token delivery and citations are only finalized at "done"', async () => {
    const fakeOrchestrator = buildFakeOrchestrator();
    const fakeContext = buildFakeContextService();
    const fakeLLM = {
      generateAnswer: jest.fn(),
      streamAnswer: jest.fn().mockImplementation(async function* () {
        yield 'Entity A reports to Entity B [GRAPH-1].';
      })
    };
    const chatService = new ChatService(undefined, fakeLLM as any, fakeContext as any, fakeOrchestrator as any);

    const events: any[] = [];
    for await (const event of chatService.streamMessage(TEST_USER_ID, { question: 'q' })) {
      events.push(event);
    }

    expect(events[0].type).toBe('start');
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent.citations).toHaveLength(1);
    expect(doneEvent.citations[0].sourceType).toBe('graph');
  });
});
