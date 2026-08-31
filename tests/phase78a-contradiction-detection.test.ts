jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeClaim: { findMany: jest.fn(), findUnique: jest.fn() },
    knowledgeEntity: { findMany: jest.fn() },
    document: { findFirst: jest.fn() },
    intelligenceInsight: { findFirst: jest.fn(), create: jest.fn() },
    intelligenceEvidence: { createMany: jest.fn(), findMany: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/rag/retrieval/retrieval.service', () => ({
  retrievalService: { retrieveContextWithTrace: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generateStructured: jest.fn() }
}));
jest.mock('@/features/multimodal-document-intelligence/security/multimodal-content-sanitizer', () => ({
  multimodalContentSanitizer: { sanitize: jest.fn((content: string) => content) }
}));
jest.mock('@/features/knowledge-graph/reasoning/contradiction.service', () => ({
  contradictionService: { detectClaimContradictions: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { contradictionService } from '@/features/knowledge-graph/reasoning/contradiction.service';
import { contradictionDetectionService } from '@/features/knowledge-intelligence/contradiction-detection.service';

function claim(overrides: Record<string, any> = {}) {
  return {
    id: 'claim-1',
    userId: 'user-1',
    projectId: null,
    subjectEntityId: 'ent-1',
    predicate: 'deadline',
    value: 'March 1',
    normalizedClaim: 'deadline: march 1',
    confidence: 0.9,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  };
}

function entity(overrides: Record<string, any> = {}) {
  return { id: 'ent-1', userId: 'user-1', canonicalName: 'ProjectX', ...overrides };
}

function chunk(overrides: Record<string, any> = {}) {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    filename: 'plan.pdf',
    chunkIndex: 0,
    pageNumber: 1,
    content: 'The deadline for ProjectX is April 15.',
    tokenCount: 10,
    similarity: 0.9,
    metadata: {},
    documentCreatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

function document(overrides: Record<string, any> = {}) {
  return {
    id: 'doc-1',
    userId: 'user-1',
    isDeleted: false,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides
  };
}

describe('Phase 78A — ContradictionDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'INTELLIGENCE_MAX_CANDIDATES') return Promise.resolve(50);
      if (key === 'INTELLIGENCE_ANALYSIS_TIMEOUT_MS') return Promise.resolve(30000);
      if (key === 'INTELLIGENCE_MIN_CONFIDENCE') return Promise.resolve(0.4);
      return Promise.resolve(def);
    });
    (contradictionService.detectClaimContradictions as jest.Mock).mockResolvedValue([]);
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.intelligenceInsight.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: `insight-${Math.random().toString(36).slice(2)}`,
      evidence: [],
      ...data
    }));
    (prisma.intelligenceEvidence.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('no-ops when INTELLIGENCE_ENABLED is false, never touching prisma or the LLM', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(key !== 'INTELLIGENCE_ENABLED'));

    const result = await contradictionDetectionService.detectContradictions('user-1');

    expect(result).toEqual({ candidatesConsidered: 0, created: 0, insightIds: [] });
    expect(prisma.knowledgeClaim.findMany).not.toHaveBeenCalled();
    expect(llmGateway.generateStructured).not.toHaveBeenCalled();
  });

  it('no-ops when INTELLIGENCE_CONTRADICTION_DETECTION_ENABLED is false', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key !== 'INTELLIGENCE_CONTRADICTION_DETECTION_ENABLED')
    );
    const result = await contradictionDetectionService.detectContradictions('user-1');
    expect(result).toEqual({ candidatesConsidered: 0, created: 0, insightIds: [] });
  });

  describe('candidate-generation bounds', () => {
    it('never classifies more candidate pairs than INTELLIGENCE_MAX_CANDIDATES', async () => {
      (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
        if (key === 'INTELLIGENCE_MAX_CANDIDATES') return Promise.resolve(3);
        if (key === 'INTELLIGENCE_ANALYSIS_TIMEOUT_MS') return Promise.resolve(30000);
        if (key === 'INTELLIGENCE_MIN_CONFIDENCE') return Promise.resolve(0.4);
        return Promise.resolve(def);
      });

      // 5 claims for one entity x 2 retrieved chunks = 10 possible pairs, far more than the bound of 3.
      const claims = Array.from({ length: 5 }, (_, i) => claim({ id: `claim-${i}`, value: `Value ${i}` }));
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue(claims);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({
        chunks: [chunk({ id: 'chunk-a' }), chunk({ id: 'chunk-b' })],
        trace: {}
      });
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
        isContradiction: false,
        confidence: 0.1,
        reasoning: 'not a contradiction'
      });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.candidatesConsidered).toBe(3);
      expect(llmGateway.generateStructured).toHaveBeenCalledTimes(3);
    });

    it('never calls retrieval for more than a handful of distinct entities', async () => {
      // 10 distinct entities, each with one claim — RAG usage must stay bounded, not O(entities).
      const claims = Array.from({ length: 10 }, (_, i) => claim({ id: `claim-${i}`, subjectEntityId: `ent-${i}` }));
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue(claims);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return ids.map((id) => entity({ id, canonicalName: id }));
      });
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [], trace: {} });

      await contradictionDetectionService.detectContradictions('user-1');

      expect((retrievalService.retrieveContextWithTrace as jest.Mock).mock.calls.length).toBeLessThanOrEqual(5);
    });
  });

  describe('true positive vs false positive persistence', () => {
    function setupOneCandidate() {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim()]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [chunk()], trace: {} });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim());
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document());
    }

    it('persists an IntelligenceInsight when the LLM classifies the pair as a true contradiction', async () => {
      setupOneCandidate();
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
        isContradiction: true,
        confidence: 0.85,
        reasoning: 'Claim says March 1, document says April 15.'
      });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(1);
      expect(prisma.intelligenceInsight.create).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.type).toBe('CONTRADICTION');
    });

    it('does NOT persist anything when the LLM says the pair is not a contradiction', async () => {
      setupOneCandidate();
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
        isContradiction: false,
        confidence: 0.9,
        reasoning: 'Consistent values, not a contradiction.'
      });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(0);
      expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
    });

    it('does NOT persist when the LLM reports a contradiction below INTELLIGENCE_MIN_CONFIDENCE', async () => {
      setupOneCandidate();
      (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
        if (key === 'INTELLIGENCE_MIN_CONFIDENCE') return Promise.resolve(0.95); // very strict floor
        if (key === 'INTELLIGENCE_MAX_CANDIDATES') return Promise.resolve(50);
        if (key === 'INTELLIGENCE_ANALYSIS_TIMEOUT_MS') return Promise.resolve(30000);
        return Promise.resolve(def);
      });
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({
        isContradiction: true,
        confidence: 0.5,
        reasoning: 'weak signal'
      });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(0);
      expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
    });

    it('does NOT pair claims from different entities together (Stage 2 alignment)', async () => {
      const claimEnt1 = claim({ id: 'claim-ent1', subjectEntityId: 'ent-1' });
      const claimEnt2 = claim({ id: 'claim-ent2', subjectEntityId: 'ent-2', value: 'Different value' });
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claimEnt1, claimEnt2]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([
        entity({ id: 'ent-1', canonicalName: 'ProjectX' }),
        entity({ id: 'ent-2', canonicalName: 'ProjectY' })
      ]);
      // Entity-specific chunk sets — chunk-x only relevant to ent-1, chunk-y only to ent-2.
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockImplementation(async (_userId: string, question: string) => {
        if (question === 'ProjectX') return { chunks: [chunk({ id: 'chunk-x', documentId: 'doc-x' })], trace: {} };
        if (question === 'ProjectY') return { chunks: [chunk({ id: 'chunk-y', documentId: 'doc-y' })], trace: {} };
        return { chunks: [], trace: {} };
      });
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: false, confidence: 0, reasoning: '' });

      await contradictionDetectionService.detectContradictions('user-1');

      // Exactly 2 pairs total (one per entity), never a claim-ent1 x chunk-y cross-entity pair.
      expect(llmGateway.generateStructured).toHaveBeenCalledTimes(2);
      const prompts = (llmGateway.generateStructured as jest.Mock).mock.calls.map((c) => c[0].prompt as string);
      expect(prompts.some((p) => p.includes('ProjectX') && p.includes('April 15'))).toBe(true);
      expect(prompts.some((p) => p.includes('ProjectY') && p.includes('April 15'))).toBe(true);
    });
  });

  describe('temporal awareness', () => {
    it('correctly identifies the document as newer when its timestamp is later than the claim', async () => {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim({ createdAt: new Date('2026-01-01') })]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({
        chunks: [chunk({ documentCreatedAt: '2026-06-01T00:00:00.000Z' })],
        trace: {}
      });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim({ createdAt: new Date('2026-01-01') }));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(
        document({ updatedAt: new Date('2026-06-01'), createdAt: new Date('2026-06-01') })
      );
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: true, confidence: 0.9, reasoning: 'x' });

      await contradictionDetectionService.detectContradictions('user-1');

      const createArgs = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.metadata.temporal.newerSourceType).toBe('DOCUMENT');
      expect(createArgs.data.metadata.temporal.olderSourceType).toBe('KNOWLEDGE_CLAIM');
    });

    it('correctly identifies the claim as newer when its timestamp is later than the document', async () => {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim({ createdAt: new Date('2026-12-01') })]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({
        chunks: [chunk({ documentCreatedAt: '2026-01-01T00:00:00.000Z' })],
        trace: {}
      });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim({ createdAt: new Date('2026-12-01') }));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(
        document({ updatedAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01') })
      );
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: true, confidence: 0.9, reasoning: 'x' });

      await contradictionDetectionService.detectContradictions('user-1');

      const createArgs = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.metadata.temporal.newerSourceType).toBe('KNOWLEDGE_CLAIM');
      expect(createArgs.data.metadata.temporal.olderSourceType).toBe('DOCUMENT');
    });
  });

  describe('evidence persistence never fabricates ids', () => {
    it('only ever passes the real, looked-up claim and document ids to createInsight', async () => {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim({ id: 'real-claim-id' })]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({
        chunks: [chunk({ documentId: 'real-document-id' })],
        trace: {}
      });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim({ id: 'real-claim-id' }));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document({ id: 'real-document-id' }));
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: true, confidence: 0.9, reasoning: 'x' });

      await contradictionDetectionService.detectContradictions('user-1');

      const createArgs = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
      const evidenceIds = createArgs.data.evidence.create.map((e: any) => e.sourceId);
      expect(evidenceIds.sort()).toEqual(['real-claim-id', 'real-document-id']);
      // The claim/document lookups were both actually performed — ids were not assumed.
      expect(prisma.knowledgeClaim.findUnique).toHaveBeenCalledWith({ where: { id: 'real-claim-id' } });
      expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'real-document-id', isDeleted: false } });
    });

    it('never persists an insight when the referenced claim can no longer be found', async () => {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim()]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [chunk()], trace: {} });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(null); // claim vanished before persistence
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document());
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: true, confidence: 0.9, reasoning: 'x' });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(0);
      expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
    });

    it('never persists an insight when the referenced document can no longer be found', async () => {
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue([claim()]);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity()]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [chunk()], trace: {} });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim());
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null); // document deleted before persistence
      (llmGateway.generateStructured as jest.Mock).mockResolvedValue({ isContradiction: true, confidence: 0.9, reasoning: 'x' });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(0);
      expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
    });
  });

  describe('a single bad candidate never crashes the whole batch', () => {
    it('continues past a candidate whose LLM call throws', async () => {
      const claims = [claim({ id: 'claim-a' }), claim({ id: 'claim-b', subjectEntityId: 'ent-2' })];
      (prisma.knowledgeClaim.findMany as jest.Mock).mockResolvedValue(claims);
      (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([
        entity({ id: 'ent-1' }),
        entity({ id: 'ent-2', canonicalName: 'ProjectY' })
      ]);
      (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [chunk()], trace: {} });
      (prisma.knowledgeClaim.findUnique as jest.Mock).mockResolvedValue(claim());
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document());

      (llmGateway.generateStructured as jest.Mock)
        .mockRejectedValueOnce(new Error('provider timeout'))
        .mockResolvedValueOnce({ isContradiction: true, confidence: 0.9, reasoning: 'ok' });

      const result = await contradictionDetectionService.detectContradictions('user-1');

      expect(result.created).toBe(1);
      expect(prisma.intelligenceInsight.create).toHaveBeenCalledTimes(1);
    });
  });
});
