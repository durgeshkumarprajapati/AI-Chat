import { documentStatisticsService } from '../../../src/features/documents/services/document-statistics.service';
import { prisma } from '../../../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';

describe('Document Statistics Service Unit & Integration Tests', () => {
  const userA = 'test-stat-user-a-uuid';
  const userB = 'test-stat-user-b-uuid';

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: userA },
      update: {},
      create: {
        id: userA,
        email: 'usera@test.com',
        name: 'User A',
        passwordHash: 'hash'
      }
    });

    await prisma.user.upsert({
      where: { id: userB },
      update: {},
      create: {
        id: userB,
        email: 'userb@test.com',
        name: 'User B',
        passwordHash: 'hash'
      }
    });
  });

  beforeEach(async () => {
    // Clean up test documents for userA and userB
    await prisma.documentChunk.deleteMany({
      where: {
        document: {
          userId: { in: [userA, userB] }
        }
      }
    });
    await prisma.document.deleteMany({
      where: { userId: { in: [userA, userB] } }
    });
  });

  afterAll(async () => {
    await prisma.documentChunk.deleteMany({
      where: {
        document: {
          userId: { in: [userA, userB] }
        }
      }
    });
    await prisma.document.deleteMany({
      where: { userId: { in: [userA, userB] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA, userB] } }
    });
  });

  it('1. Returns zero statistics for user with no documents', async () => {
    const stats = await documentStatisticsService.getUserDocumentStatistics(userA);
    expect(stats.totalDocuments).toBe(0);
    expect(stats.completedDocuments).toBe(0);
    expect(stats.processingDocuments).toBe(0);
    expect(stats.failedDocuments).toBe(0);
  });

  it('2. Correctly reflects COMPLETED document count and page count', async () => {
    await prisma.document.create({
      data: {
        id: 'doc-completed-1',
        userId: userA,
        filename: 'CompletedDoc.pdf',
        originalFilename: 'CompletedDoc.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'storage-key-1',
        status: DocumentStatus.COMPLETED,
        pageCount: 15
      }
    });

    const stats = await documentStatisticsService.getUserDocumentStatistics(userA);
    expect(stats.totalDocuments).toBe(1);
    expect(stats.completedDocuments).toBe(1);
    expect(stats.processingDocuments).toBe(0);
    expect(stats.totalPages).toBe(15);
  });

  it('3. Correctly categorizes PROCESSING and FAILED document statuses', async () => {
    await prisma.document.createMany({
      data: [
        {
          id: 'doc-comp-1',
          userId: userA,
          filename: 'Doc1.pdf',
          originalFilename: 'Doc1.pdf',
          mimeType: 'application/pdf',
          fileSize: 500,
          storageKey: 'key-1',
          status: DocumentStatus.COMPLETED,
          pageCount: 10
        },
        {
          id: 'doc-comp-2',
          userId: userA,
          filename: 'Doc2.pdf',
          originalFilename: 'Doc2.pdf',
          mimeType: 'application/pdf',
          fileSize: 600,
          storageKey: 'key-2',
          status: DocumentStatus.COMPLETED,
          pageCount: 20
        },
        {
          id: 'doc-proc-1',
          userId: userA,
          filename: 'Doc3.pdf',
          originalFilename: 'Doc3.pdf',
          mimeType: 'application/pdf',
          fileSize: 700,
          storageKey: 'key-3',
          status: DocumentStatus.PROCESSING,
          pageCount: 0
        },
        {
          id: 'doc-fail-1',
          userId: userA,
          filename: 'Doc4.pdf',
          originalFilename: 'Doc4.pdf',
          mimeType: 'application/pdf',
          fileSize: 800,
          storageKey: 'key-4',
          status: DocumentStatus.FAILED,
          pageCount: 0
        }
      ]
    });

    const stats = await documentStatisticsService.getUserDocumentStatistics(userA);
    expect(stats.totalDocuments).toBe(4);
    expect(stats.completedDocuments).toBe(2);
    expect(stats.processingDocuments).toBe(1);
    expect(stats.failedDocuments).toBe(1);
    expect(stats.totalPages).toBe(30);
  });

  it('4. Enforces strict tenant isolation between User A and User B', async () => {
    await prisma.document.create({
      data: {
        id: 'doc-user-a',
        userId: userA,
        filename: 'UserADoc.pdf',
        originalFilename: 'UserADoc.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        storageKey: 'key-a',
        status: DocumentStatus.COMPLETED,
        pageCount: 5
      }
    });

    await prisma.document.createMany({
      data: [
        {
          id: 'doc-user-b-1',
          userId: userB,
          filename: 'UserBDoc1.pdf',
          originalFilename: 'UserBDoc1.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          storageKey: 'key-b1',
          status: DocumentStatus.COMPLETED,
          pageCount: 10
        },
        {
          id: 'doc-user-b-2',
          userId: userB,
          filename: 'UserBDoc2.pdf',
          originalFilename: 'UserBDoc2.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          storageKey: 'key-b2',
          status: DocumentStatus.COMPLETED,
          pageCount: 10
        }
      ]
    });

    const statsA = await documentStatisticsService.getUserDocumentStatistics(userA);
    const statsB = await documentStatisticsService.getUserDocumentStatistics(userB);

    expect(statsA.totalDocuments).toBe(1);
    expect(statsB.totalDocuments).toBe(2);
  });
});
