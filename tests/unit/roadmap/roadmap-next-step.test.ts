import { getNextStep, NextStepPhase } from '@/features/roadmap/execution/roadmap-next-step';

function phase(overrides: Partial<NextStepPhase> = {}): NextStepPhase {
  return { id: 'phase-1', title: 'Phase 1', order: 1, tasks: [], ...overrides };
}

describe('getNextStep', () => {
  it('10./11. an IN_PROGRESS item takes priority over any NOT_STARTED item', () => {
    const phases: NextStepPhase[] = [
      phase({
        tasks: [
          { id: 't1', phaseId: 'phase-1', title: 'Task 1', order: 1, status: 'IN_PROGRESS' },
          { id: 't2', phaseId: 'phase-1', title: 'Task 2', order: 2, status: 'PENDING' }
        ]
      })
    ];

    const result = getNextStep(phases);

    expect(result).toEqual({ taskId: 't1', phaseId: 'phase-1', taskTitle: 'Task 1', phaseTitle: 'Phase 1', reason: 'CONTINUE_IN_PROGRESS' });
  });

  it('recommends the EARLIEST in-progress task by phase/task order when multiple are in progress', () => {
    const phases: NextStepPhase[] = [
      phase({ id: 'phase-2', order: 2, tasks: [{ id: 't-late', phaseId: 'phase-2', title: 'Late', order: 1, status: 'IN_PROGRESS' }] }),
      phase({ id: 'phase-1', order: 1, tasks: [{ id: 't-early', phaseId: 'phase-1', title: 'Early', order: 1, status: 'IN_PROGRESS' }] })
    ];

    const result = getNextStep(phases);

    expect(result?.taskId).toBe('t-early');
  });

  it('2. otherwise recommends the earliest NOT_STARTED (PENDING) item in roadmap order', () => {
    const phases: NextStepPhase[] = [
      phase({
        tasks: [
          { id: 't1', phaseId: 'phase-1', title: 'Done', order: 1, status: 'COMPLETED' },
          { id: 't2', phaseId: 'phase-1', title: 'Next up', order: 2, status: 'PENDING' },
          { id: 't3', phaseId: 'phase-1', title: 'Later', order: 3, status: 'PENDING' }
        ]
      })
    ];

    const result = getNextStep(phases);

    expect(result).toEqual({ taskId: 't2', phaseId: 'phase-1', taskTitle: 'Next up', phaseTitle: 'Phase 1', reason: 'START_NEXT' });
  });

  it('respects phase order, not just task order, when finding the earliest pending task', () => {
    const phases: NextStepPhase[] = [
      phase({ id: 'phase-2', order: 2, tasks: [{ id: 't-in-phase-2', phaseId: 'phase-2', title: 'x', order: 1, status: 'PENDING' }] }),
      phase({ id: 'phase-1', order: 1, tasks: [{ id: 't-in-phase-1', phaseId: 'phase-1', title: 'y', order: 1, status: 'PENDING' }] })
    ];

    const result = getNextStep(phases);

    expect(result?.taskId).toBe('t-in-phase-1');
  });

  it('12. a fully COMPLETED roadmap returns null (caller distinguishes "complete" from "empty" using the task count)', () => {
    const phases: NextStepPhase[] = [
      phase({ tasks: [{ id: 't1', phaseId: 'phase-1', title: 'Done', order: 1, status: 'COMPLETED' }] })
    ];

    const result = getNextStep(phases);

    expect(result).toBeNull();
  });

  it('a roadmap with zero tasks also returns null', () => {
    expect(getNextStep([phase({ tasks: [] })])).toBeNull();
  });

  it('does not mutate the input phases/tasks arrays', () => {
    const phases: NextStepPhase[] = [
      phase({ tasks: [{ id: 't1', phaseId: 'phase-1', title: 'x', order: 2, status: 'PENDING' }, { id: 't2', phaseId: 'phase-1', title: 'y', order: 1, status: 'PENDING' }] })
    ];
    const snapshot = JSON.parse(JSON.stringify(phases));

    getNextStep(phases);

    expect(phases).toEqual(snapshot);
  });
});
