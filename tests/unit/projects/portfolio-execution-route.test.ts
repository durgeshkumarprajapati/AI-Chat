jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }));

const mockGetPortfolioExecutionSummary = jest.fn();
jest.mock('@/features/projects/execution/portfolio-execution.service', () => ({
  portfolioExecutionService: { getPortfolioExecutionSummary: (...args: unknown[]) => mockGetPortfolioExecutionSummary(...args) }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { GET } from '@/app/api/projects/execution/portfolio/route';

describe('GET /api/projects/execution/portfolio', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the portfolio summary for the authenticated user', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    const data = { projects: [], summary: { total: 0, healthy: 0, atRisk: 0, critical: 0 }, priorities: [], attention: { blocked: 0, overdue: 0 } };
    mockGetPortfolioExecutionSummary.mockResolvedValue(data);

    const res = await GET(new NextRequest('http://localhost:3000/api/projects/execution/portfolio'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(data);
    expect(mockGetPortfolioExecutionSummary).toHaveBeenCalledWith('user-1');
  });

  it('returns a generic 500 without leaking internals on an unexpected error', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockGetPortfolioExecutionSummary.mockRejectedValue(new Error('unexpected db failure'));

    const res = await GET(new NextRequest('http://localhost:3000/api/projects/execution/portfolio'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).not.toContain('unexpected db failure');
  });
});
