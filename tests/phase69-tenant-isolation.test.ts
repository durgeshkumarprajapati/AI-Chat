process.env.STORAGE_PROVIDER = 'local';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_S3_BUCKET = 'test-bucket';

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/documents/[id]/intelligence/route';
import { prisma } from '@/lib/prisma';

describe('Phase 69A — Document Intelligence API tenant isolation', () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let documentA: { id: string };

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: { email: `phase69_di_a_${Date.now()}@test.com`, name: 'Phase69 DI A' }
    });
    userB = await prisma.user.create({
      data: { email: `phase69_di_b_${Date.now()}@test.com`, name: 'Phase69 DI B' }
    });

    documentA = await prisma.document.create({
      data: {
        userId: userA.id,
        filename: 'phase69-owned-by-a.pdf',
        originalFilename: 'phase69-owned-by-a.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: `documents/${userA.id}/phase69-test/phase69-owned-by-a.pdf`,
        status: 'COMPLETED'
      }
    });

    await prisma.documentIntelligence.create({
      data: {
        documentId: documentA.id,
        userId: userA.id,
        status: 'COMPLETED',
        documentType: 'REPORT',
        classificationConfidence: 0.9,
        extractedMetadata: { title: 'A confidential report' }
      }
    });
  });

  afterAll(async () => {
    await prisma.documentIntelligence.deleteMany({ where: { documentId: documentA.id } });
    await prisma.document.deleteMany({ where: { id: documentA.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('returns intelligence data to the owning user', async () => {
    const req = new NextRequest(`http://localhost:3000/api/documents/${documentA.id}/intelligence`, {
      headers: { Authorization: `Bearer ${userA.id}` }
    });

    const res = await GET(req, { params: { id: documentA.id } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.intelligence).not.toBeNull();
    expect(json.data.intelligence.documentType).toBe('REPORT');
  });

  it('denies a different user from reading another tenant’s document intelligence', async () => {
    const req = new NextRequest(`http://localhost:3000/api/documents/${documentA.id}/intelligence`, {
      headers: { Authorization: `Bearer ${userB.id}` }
    });

    const res = await GET(req, { params: { id: documentA.id } });
    const json = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(json.success).toBe(false);
    expect(json.data).toBeUndefined();
  });

  it('returns a null intelligence payload (not an error) for a document with no intelligence row', async () => {
    const legacyDoc = await prisma.document.create({
      data: {
        userId: userA.id,
        filename: 'phase69-legacy-no-intelligence.pdf',
        originalFilename: 'phase69-legacy-no-intelligence.pdf',
        mimeType: 'application/pdf',
        fileSize: 512,
        storageKey: `documents/${userA.id}/phase69-legacy/phase69-legacy-no-intelligence.pdf`,
        status: 'COMPLETED'
      }
    });

    try {
      const req = new NextRequest(`http://localhost:3000/api/documents/${legacyDoc.id}/intelligence`, {
        headers: { Authorization: `Bearer ${userA.id}` }
      });

      const res = await GET(req, { params: { id: legacyDoc.id } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.intelligence).toBeNull();
    } finally {
      await prisma.document.deleteMany({ where: { id: legacyDoc.id } });
    }
  });
});
