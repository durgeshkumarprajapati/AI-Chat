jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireRole: jest.fn((user, role) => {
    if (user.role !== role) {
      const { AuthorizationError } = require('@/errors');
      throw new AuthorizationError('Administrator privileges are required.');
    }
  })
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    ragEvaluation: {
      aggregate: jest.fn().mockResolvedValue({
        _avg: { latencyMs: 850, retrievalLatencyMs: 120, llmLatencyMs: 600, llmFirstTokenMs: 200 }
      }),
      count: jest.fn().mockResolvedValue(42)
    }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { set: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue('1') }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn().mockResolvedValue(300), getBoolean: jest.fn().mockResolvedValue(true) }
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { GET } from '@/app/api/admin/performance/route';

describe('Phase 77 — /api/admin/performance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-admin caller with 403', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));

    expect(res.status).toBe(403);
  });

  it('reports live DB/Redis pings and real RagEvaluation aggregates for an admin caller', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.database.healthy).toBe(true);
    expect(json.data.redis.healthy).toBe(true);
    expect(json.data.rag.avgTotalLatencyMs).toBe(850);
    expect(json.data.rag.sampleCount).toBe(42);
  });

  it('never fabricates worker throughput data — reports available:false with a reason instead', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.worker.available).toBe(false);
    expect(typeof json.data.worker.reason).toBe('string');
    expect(json.data.worker.reason.length).toBeGreaterThan(0);
  });
});
