jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: { findMany: jest.fn(), findFirst: jest.fn() },
    documentLifecycleEvent: { findFirst: jest.fn() },
    documentFamily: { findUnique: jest.fn() },
    intelligenceInsight: { findFirst: jest.fn(), create: jest.fn() },
    intelligenceEvidence: { createMany: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { computeFreshnessLevel, freshnessDetectionService } from '@/features/knowledge-intelligence/freshness-detection.service';

describe('Phase 78A — freshness classification (pure function)', () => {
  const now = new Date('2026-08-31T00:00:00.000Z');

  it('classifies a recently-active document as FRESH', () => {
    const result = computeFreshnessLevel({
      documentId: 'doc-fresh',
      familyId: null,
      lastActivityAt: new Date('2026-08-20T00:00:00.000Z'), // 11 days ago
      now,
      supersededByDocumentId: null
    });
    expect(result.level).toBe('FRESH');
  });

  it('classifies a document past the review threshold as REVIEW_RECOMMENDED', () => {
    const result = computeFreshnessLevel({
      documentId: 'doc-review',
      familyId: null,
      lastActivityAt: new Date('2026-07-01T00:00:00.000Z'), // ~61 days ago
      now,
      supersededByDocumentId: null
    });
    expect(result.level).toBe('REVIEW_RECOMMENDED');
  });

  it('classifies a document past the possibly-stale threshold as POSSIBLY_STALE', () => {
    const result = computeFreshnessLevel({
      documentId: 'doc-possibly-stale',
      familyId: null,
      lastActivityAt: new Date('2026-04-01T00:00:00.000Z'), // ~152 days ago
      now,
      supersededByDocumentId: null
    });
    expect(result.level).toBe('POSSIBLY_STALE');
  });

  it('classifies a long-untouched document as STALE', () => {
    const result = computeFreshnessLevel({
      documentId: 'doc-stale',
      familyId: null,
      lastActivityAt: new Date('2025-01-01T00:00:00.000Z'), // > 180 days ago
      now,
      supersededByDocumentId: null
    });
    expect(result.level).toBe('STALE');
    expect(result.ageDays).toBeGreaterThan(180);
  });

  it('classifies a document with a newer active family member as SUPERSEDED regardless of its own age', () => {
    const result = computeFreshnessLevel({
      documentId: 'doc-old-version',
      familyId: 'family-1',
      lastActivityAt: new Date('2026-08-30T00:00:00.000Z'), // very recent, would otherwise be FRESH
      now,
      supersededByDocumentId: 'doc-newer-version'
    });
    expect(result.level).toBe('SUPERSEDED');
    expect(result.supersededByDocumentId).toBe('doc-newer-version');
  });
});

describe('Phase 78A — FreshnessDetectionService (service integration, mocked Prisma)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'INTELLIGENCE_MAX_CANDIDATES') return Promise.resolve(50);
      return Promise.resolve(def);
    });
    (prisma.documentLifecycleEvent.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.documentFamily.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.intelligenceInsight.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: `insight-${data.metadata.documentId}`,
      evidence: [],
      ...data
    }));
  });

  it('no-ops entirely when INTELLIGENCE_FRESHNESS_DETECTION_ENABLED is false', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key !== 'INTELLIGENCE_FRESHNESS_DETECTION_ENABLED')
    );
    const result = await freshnessDetectionService.detectStaleDocuments('user-1');
    expect(result).toEqual({ documentsScanned: 0, created: 0, insightIds: [] });
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('creates a STALE insight for a stale document but no insight for a fresh one', async () => {
    const now = Date.now();
    const freshDoc = {
      id: 'doc-fresh',
      filename: 'fresh.pdf',
      familyId: null,
      updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000)
    };
    const staleDoc = {
      id: 'doc-stale',
      filename: 'stale.pdf',
      familyId: null,
      updatedAt: new Date(now - 200 * 24 * 60 * 60 * 1000)
    };
    (prisma.document.findMany as jest.Mock).mockResolvedValue([freshDoc, staleDoc]);

    const result = await freshnessDetectionService.detectStaleDocuments('user-1');

    expect(result.documentsScanned).toBe(2);
    expect(result.created).toBe(1);
    expect(prisma.intelligenceInsight.create).toHaveBeenCalledTimes(1);

    const createCall = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.type).toBe('STALE_KNOWLEDGE');
    expect(createCall.data.severity).toBe('HIGH');
    expect(createCall.data.metadata.documentId).toBe('doc-stale');
    expect(createCall.data.metadata.freshnessLevel).toBe('STALE');
    // Evidence must cite the real document id that was actually looked up — never a fabricated one.
    expect(createCall.data.evidence.create[0].sourceId).toBe('doc-stale');
  });
});
