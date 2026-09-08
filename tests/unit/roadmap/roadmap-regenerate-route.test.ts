jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn()
}));

const mockFindRoadmapByIdForUser = jest.fn();
const mockReplacePhaseTasks = jest.fn();
jest.mock('@/features/roadmap/repository/roadmap.repository', () => ({
  roadmapRepository: {
    findRoadmapByIdForUser: (...args: unknown[]) => mockFindRoadmapByIdForUser(...args),
    replacePhaseTasks: (...args: unknown[]) => mockReplacePhaseTasks(...args)
  }
}));

const mockRegeneratePhase = jest.fn();
jest.mock('@/features/roadmap/generation/roadmap-planner.service', () => ({
  roadmapPlannerService: { regeneratePhase: (...args: unknown[]) => mockRegeneratePhase(...args) }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { POST } from '@/app/api/roadmaps/[id]/phases/[phaseId]/regenerate/route';

function req() {
  return new NextRequest('http://localhost:3000/api/roadmaps/roadmap-1/phases/phase-1/regenerate', { method: 'POST' });
}

describe('POST /api/roadmaps/[id]/phases/[phaseId]/regenerate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('17. regenerates normally when the phase has no progress (all tasks PENDING)', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: {
        questionnaireSnapshot: {},
        phases: [{ id: 'phase-1', title: 't', description: 'd', durationWeeks: 1, tasks: [{ status: 'PENDING' }] }]
      }
    });
    mockRegeneratePhase.mockResolvedValue({ title: 'New', description: 'New desc', tasks: [] });
    mockReplacePhaseTasks.mockResolvedValue({ id: 'phase-1' });

    const res = await POST(req(), { params: { id: 'roadmap-1', phaseId: 'phase-1' } });

    expect(res.status).toBe(200);
    expect(mockRegeneratePhase).toHaveBeenCalled();
  });

  it('15. rejects regeneration (409) when the phase has an in-progress task — without ever calling the LLM', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: {
        questionnaireSnapshot: {},
        phases: [{ id: 'phase-1', title: 't', description: 'd', durationWeeks: 1, tasks: [{ status: 'IN_PROGRESS' }] }]
      }
    });

    const res = await POST(req(), { params: { id: 'roadmap-1', phaseId: 'phase-1' } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(mockRegeneratePhase).not.toHaveBeenCalled(); // no wasted LLM call
    expect(mockReplacePhaseTasks).not.toHaveBeenCalled();
  });

  it('rejects regeneration when the phase has a COMPLETED task', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockFindRoadmapByIdForUser.mockResolvedValue({
      permission: 'OWNER',
      roadmap: {
        questionnaireSnapshot: {},
        phases: [{ id: 'phase-1', title: 't', description: 'd', durationWeeks: 1, tasks: [{ status: 'COMPLETED' }] }]
      }
    });

    const res = await POST(req(), { params: { id: 'roadmap-1', phaseId: 'phase-1' } });

    expect(res.status).toBe(409);
  });
});
