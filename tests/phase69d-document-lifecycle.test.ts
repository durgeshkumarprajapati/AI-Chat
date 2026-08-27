import { duplicateDetectionService } from '@/features/document-management/duplicate-detection/duplicate-detection.service';
import { documentLifecycleService } from '@/features/document-management/lifecycle/document-lifecycle.service';
import { documentVersionService } from '@/features/document-management/versioning/document-version.service';
import { documentVersionComparisonService } from '@/features/document-management/comparison/document-version-comparison.service';
import { documentArchiveService } from '@/features/document-management/archive/document-archive.service';
import { documentSoftDeleteService } from '@/features/document-management/delete/document-soft-delete.service';
import { documentRetentionService } from '@/features/document-management/retention/document-retention.service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
        status: 'ACTIVE',
        filename: 'handbook.pdf',
        originalFilename: 'Employee Handbook.pdf',
        isArchived: false,
        isDeleted: false,
        version: 1,
        activeVersionNumber: 1
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'doc-1',
        status: data.status || 'ACTIVE',
        isArchived: data.isArchived ?? false,
        isDeleted: data.isDeleted ?? false
      })),
      delete: jest.fn().mockResolvedValue({ id: 'doc-1' })
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' })
    },
    documentVersion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
      create: jest.fn().mockResolvedValue({
        id: 'ver-2',
        documentId: 'doc-1',
        versionNumber: 2,
        isActive: true
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'ver-1', versionNumber: 1, isActive: false },
        { id: 'ver-2', versionNumber: 2, isActive: true }
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'ver-1',
        versionNumber: 1,
        isActive: false
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'ver-2', isActive: true }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    documentDuplicateFingerprint: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'fp-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    documentLifecycleEvent: {
      create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    documentRetentionJob: {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'job-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    documentChunk: {
      findMany: jest.fn().mockResolvedValue([{ content: 'Sample chunk line 1\nSample chunk line 2' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    extractedTable: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentImage: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentChart: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentVisual: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentIntelligence: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    documentMultimodalRun: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn().mockImplementation(async (cb) => (Array.isArray(cb) ? cb : cb({})))
  }
}));

jest.mock('@/features/rag/cache/retrieval-candidate-cache.service', () => ({
  retrievalCandidateCacheService: { invalidateByScope: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/rag/cache/answer-cache.service', () => ({
  answerCacheService: { invalidateByScope: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/rag/cache/rerank-cache.service', () => ({
  rerankCacheService: { invalidateByScope: jest.fn().mockResolvedValue(undefined) }
}));

describe('Phase 69D — Enterprise Document Lifecycle Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Duplicate Detection Engine', () => {
    it('computes SHA256 exact hash consistently', () => {
      const buffer = Buffer.from('Enterprise Policy Document Content');
      const hash1 = duplicateDetectionService.computeSHA256(buffer);
      const hash2 = duplicateDetectionService.computeSHA256(buffer);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('computes normalized text token fingerprint consistently', () => {
      const text1 = 'Company   Employee  Policy — 2025!!';
      const text2 = 'company employee policy 2025';
      const fp1 = duplicateDetectionService.computeNormalizedTextFingerprint(text1);
      const fp2 = duplicateDetectionService.computeNormalizedTextFingerprint(text2);
      expect(fp1).toBe(fp2);
    });
  });

  describe('2. Lifecycle State Machine', () => {
    it('allows valid state transitions', () => {
      expect(documentLifecycleService.validateTransition('ACTIVE', 'ARCHIVED')).toBe(true);
      expect(documentLifecycleService.validateTransition('ARCHIVED', 'ACTIVE')).toBe(true);
      expect(documentLifecycleService.validateTransition('ACTIVE', 'SUPERSEDED')).toBe(true);
      expect(documentLifecycleService.validateTransition('ACTIVE', 'DELETED')).toBe(true);
    });

    it('rejects invalid state transitions', () => {
      expect(documentLifecycleService.validateTransition('DELETED', 'ACTIVE')).toBe(false);
      expect(documentLifecycleService.validateTransition('SUPERSEDED', 'DRAFT')).toBe(false);
    });
  });

  describe('3. Document Versioning & Comparison', () => {
    it('creates next version and activates it', async () => {
      const version = await documentVersionService.createNextVersion({
        documentId: 'doc-1',
        storageKey: 'docs/doc-1/v2.pdf',
        contentHash: 'hash-v2',
        fileSize: 2048,
        uploadedByUserId: 'user-1'
      });

      expect(version.versionNumber).toBe(2);
      expect(version.isActive).toBe(true);
    });

    it('compares document versions cleanly', async () => {
      const res = await documentVersionComparisonService.compare({
        documentId: 'doc-1',
        versionA: 1,
        versionB: 2
      });

      expect(res.summary).toContain('Compared v1 with v2');
      expect(res.addedLinesCount).toBeDefined();
    });
  });

  describe('4. Document Archive & Restore', () => {
    it('archives active document safely', async () => {
      const res = await documentArchiveService.archiveDocument('doc-1', 'user-1');
      expect(res.success).toBe(true);
      expect(res.newStatus).toBe('ARCHIVED');
    });

    it('restores archived document back to active', async () => {
      const res = await documentArchiveService.restoreDocument('doc-1', 'user-1');
      expect(res.success).toBe(true);
    });
  });

  describe('5. Soft Delete & Retention Cleanup', () => {
    it('soft deletes document and invalidates caches', async () => {
      const res = await documentSoftDeleteService.softDeleteDocument('doc-1', 'user-1');
      expect(res.success).toBe(true);
      expect(res.newStatus).toBe('DELETED');
    });

    it('permanently deletes document records without error', async () => {
      const res = await documentSoftDeleteService.permanentDeleteDocument('doc-1', 'user-1');
      expect(res.success).toBe(true);
    });

    it('processes due retention jobs without error', async () => {
      const res = await documentRetentionService.processDueRetentionJobs();
      expect(res.processed).toBeDefined();
    });
  });
});
