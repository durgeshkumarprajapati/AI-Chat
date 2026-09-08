const mockTaskFindUniqueOrThrow = jest.fn();
const mockTaskUpdate = jest.fn();
const mockTaskFindMany = jest.fn();
const mockTaskDeleteMany = jest.fn();
const mockPhaseUpdate = jest.fn();
const mockPhaseFindUnique = jest.fn();
const mockRoadmapFindUnique = jest.fn();
const mockRoadmapUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    roadmapTask: {
      findUniqueOrThrow: (...args: unknown[]) => mockTaskFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockTaskUpdate(...args),
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
      deleteMany: (...args: unknown[]) => mockTaskDeleteMany(...args)
    },
    roadmapPhase: {
      update: (...args: unknown[]) => mockPhaseUpdate(...args),
      findUnique: (...args: unknown[]) => mockPhaseFindUnique(...args)
    },
    roadmap: {
      findUnique: (...args: unknown[]) => mockRoadmapFindUnique(...args),
      update: (...args: unknown[]) => mockRoadmapUpdate(...args)
    }
  }
}));

const mockLogEvent = jest.fn();
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: (...args: unknown[]) => mockLogEvent(...args) }
}));

import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { ConflictError } from '@/errors';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1', phaseId: 'phase-1', title: 'Learn X', status: 'PENDING',
    startedAt: null, completedAt: null, notes: null,
    ...overrides
  };
}

describe('RoadmapRepository.updateTaskStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoadmapFindUnique.mockResolvedValue({ phases: [] });
    mockRoadmapUpdate.mockResolvedValue({});
  });

  it('1./2. starting a PENDING task transitions to IN_PROGRESS and sets startedAt', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task());
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'IN_PROGRESS', startedAt: new Date() }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'IN_PROGRESS', undefined, 'user-1');

    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS', startedAt: expect.any(Date), completedAt: null })
    }));
  });

  it('3. completing a task sets COMPLETED + completedAt', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task({ status: 'IN_PROGRESS', startedAt: new Date() }));
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'COMPLETED' }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'COMPLETED', undefined, 'user-1');

    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) })
    }));
  });

  it('4. reopening a COMPLETED task transitions back to IN_PROGRESS and clears completedAt', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task({ status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() }));
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'IN_PROGRESS' }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'IN_PROGRESS', undefined, 'user-1');

    expect(mockTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS', completedAt: null })
    }));
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'roadmap.task.reopened' }));
  });

  it('5. repeating an identical status update is idempotent and does NOT log a duplicate audit event', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task({ status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() }));
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'COMPLETED' }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'COMPLETED', undefined, 'user-1');

    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('logs a distinct audit action per transition type (started/completed)', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task());
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'IN_PROGRESS' }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'IN_PROGRESS', undefined, 'user-1');

    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-1', action: 'roadmap.task.started', targetType: 'RoadmapTask', targetId: 'task-1'
    }));
  });

  it('never logs raw content — only operational metadata (roadmapId/phaseId/taskTitle)', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task());
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'COMPLETED' }), phase: { roadmapId: 'roadmap-1' } });

    await roadmapRepository.updateTaskStatus('task-1', 'COMPLETED', undefined, 'user-1');

    const details = mockLogEvent.mock.calls[0][0].details;
    expect(Object.keys(details).sort()).toEqual(['phaseId', 'roadmapId', 'taskTitle']);
  });

  it('recalculates roadmap-level progress after every status change', async () => {
    mockTaskFindUniqueOrThrow.mockResolvedValue(task());
    mockTaskUpdate.mockResolvedValue({ ...task({ status: 'IN_PROGRESS' }), phase: { roadmapId: 'roadmap-1' } });
    mockRoadmapFindUnique.mockResolvedValue({ phases: [{ tasks: [{ status: 'IN_PROGRESS' }] }] });

    await roadmapRepository.updateTaskStatus('task-1', 'IN_PROGRESS', undefined, 'user-1');

    expect(mockRoadmapUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'roadmap-1' } }));
  });
});

describe('RoadmapRepository.replacePhaseTasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('regenerates a phase with no progress (all PENDING) normally', async () => {
    mockTaskFindMany.mockResolvedValue([{ status: 'PENDING' }, { status: 'PENDING' }]);
    mockPhaseUpdate.mockResolvedValue({});
    mockPhaseFindUnique.mockResolvedValue({ id: 'phase-1', roadmapId: 'roadmap-1', tasks: [] });
    mockRoadmapFindUnique.mockResolvedValue({ phases: [] });
    mockRoadmapUpdate.mockResolvedValue({});

    await roadmapRepository.replacePhaseTasks('phase-1', 'New Title', 'New Desc', [{ title: 't', description: 'd', estimatedHours: 1 }]);

    expect(mockTaskDeleteMany).toHaveBeenCalledWith({ where: { phaseId: 'phase-1' } });
  });

  it('15. refuses to regenerate a phase that has in-progress or completed tasks — preserves existing progress', async () => {
    mockTaskFindMany.mockResolvedValue([{ status: 'IN_PROGRESS' }]);

    await expect(
      roadmapRepository.replacePhaseTasks('phase-1', 'New Title', 'New Desc', [{ title: 't', description: 'd', estimatedHours: 1 }])
    ).rejects.toThrow(ConflictError);
    expect(mockTaskDeleteMany).not.toHaveBeenCalled();
  });

  it('also refuses regeneration when a task is already COMPLETED', async () => {
    mockTaskFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);

    await expect(
      roadmapRepository.replacePhaseTasks('phase-1', 'New Title', 'New Desc', [])
    ).rejects.toThrow(ConflictError);
  });
});
