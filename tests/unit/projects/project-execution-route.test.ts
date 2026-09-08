jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }));

const mockGetProjectExecutionSummary = jest.fn();
jest.mock('@/features/projects/execution/project-execution.service', () => ({
  projectExecutionService: { getProjectExecutionSummary: (...args: unknown[]) => mockGetProjectExecutionSummary(...args) }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AuthorizationError } from '@/errors';
import { GET } from '@/app/api/projects/[id]/execution/route';

function getRequest() {
  return new NextRequest('http://localhost:3000/api/projects/project-1/execution', { method: 'GET' });
}

describe('GET /api/projects/[id]/execution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the aggregated summary for an authorized user', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    const summary = { status: 'HEALTHY', roadmapCount: 1, progress: { completed: 1, total: 2, percentage: 50 }, attention: {}, roadmaps: [], inaccessibleRoadmapCount: 0, timeline: { status: 'INSUFFICIENT_DATA' } };
    mockGetProjectExecutionSummary.mockResolvedValue(summary);

    const res = await GET(getRequest(), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(summary);
    expect(mockGetProjectExecutionSummary).toHaveBeenCalledWith('user-1', 'project-1');
  });

  it('Scenario B/C: rejects a user with no project access (or revoked access) with the service-thrown AuthorizationError', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockGetProjectExecutionSummary.mockRejectedValue(new AuthorizationError('Access denied.'));

    const res = await GET(getRequest(), { params: { id: 'project-1' } });

    expect(res.status).toBe(403);
  });

  it('handles a project with zero linked roadmaps without erroring', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockGetProjectExecutionSummary.mockResolvedValue({ status: 'HEALTHY', roadmapCount: 0, progress: { completed: 0, total: 0, percentage: 0 }, attention: {}, roadmaps: [], inaccessibleRoadmapCount: 0, timeline: { status: 'INSUFFICIENT_DATA' } });

    const res = await GET(getRequest(), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.roadmapCount).toBe(0);
  });

  it('handles multiple linked roadmaps and returns the full aggregated roadmap list', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockGetProjectExecutionSummary.mockResolvedValue({
      status: 'AT_RISK', roadmapCount: 2,
      progress: { completed: 5, total: 10, percentage: 50 },
      attention: {}, roadmaps: [{ roadmapId: 'r1' }, { roadmapId: 'r2' }],
      inaccessibleRoadmapCount: 0, timeline: { status: 'INSUFFICIENT_DATA' }
    });

    const res = await GET(getRequest(), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(body.data.roadmaps).toHaveLength(2);
  });

  it('returns a generic 500 without leaking internals on an unexpected error', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockGetProjectExecutionSummary.mockRejectedValue(new Error('unexpected db failure'));

    const res = await GET(getRequest(), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).not.toContain('unexpected db failure');
  });
});
