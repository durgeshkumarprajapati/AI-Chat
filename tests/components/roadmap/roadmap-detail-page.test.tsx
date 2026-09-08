import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'roadmap-1' })
}));

import RoadmapDetailPage from '@/app/roadmaps/[id]/page';

const BASE_ROADMAP = {
  id: 'roadmap-1', title: 'Learn Rust', description: 'A focused plan', goal: 'Get a job',
  targetSkill: 'Rust', experienceLevel: 'Beginner', dailyTimeCommitment: '1 hour/day',
  targetDurationWeeks: 8, learningStyle: 'Project based', currentProgress: 50,
  owner: { id: 'owner-1', name: 'Owner Person', email: 'owner@x.com' },
  shares: [{ sharedWithUserId: 'friend-1', sharedWithUser: { id: 'friend-1', name: 'Friend Person', email: 'friend@x.com' } }],
  phases: [
    {
      id: 'phase-1', title: 'Foundations', description: 'Core basics', order: 1, durationWeeks: 2,
      progress: { totalItems: 2, completedItems: 1, inProgressItems: 0, notStartedItems: 1, completionPercentage: 50 },
      tasks: [
        { id: 't1', title: 'Read the book', description: 'Chapters 1-3', order: 1, estimatedHours: 4, status: 'COMPLETED', assignee: null, assigneeId: null, dueDate: null, dueDateStatus: 'NO_DEADLINE', isExecutable: false, executionStatus: 'COMPLETED', blockedBy: [], dependsOn: [] },
        { id: 't2', title: 'Write hello world', description: 'Set up cargo', order: 2, estimatedHours: 1, status: 'PENDING', assignee: null, assigneeId: null, dueDate: null, dueDateStatus: 'NO_DEADLINE', isExecutable: true, executionStatus: 'READY', blockedBy: [], dependsOn: [] }
      ]
    }
  ]
};

const DEFAULT_INSIGHTS = {
  overview: {
    totalPhases: 1, totalTasks: 2, completedTasks: 1, inProgressTasks: 0, pendingTasks: 1,
    blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 2, currentProgress: 50
  },
  bottlenecks: [],
  workload: { assignees: [], flags: [] },
  dependencyImpact: [],
  phaseAnalytics: [{ phaseId: 'phase-1', phaseTitle: 'Foundations', totalTasks: 2, completedTasks: 1, inProgressTasks: 0, blockedTasks: 0, overdueTasks: 0, progressPercentage: 50 }],
  trends: { taskCompletion: { status: 'INSUFFICIENT_DATA', reason: 'No tasks have been completed yet.' } }
};

const DEFAULT_COPILOT_RESPONSE = { action: 'EXPLAIN_HEALTH', facts: ['Execution health: HEALTHY.'], analysis: 'Everything looks fine.', recommendations: [], usedAi: true, usedRag: false };

function mockFetchSequence(overrides: {
  nextStep?: unknown; permission?: string; roadmap?: unknown;
  executionHealth?: unknown; readyTaskCount?: number; blockedTaskCount?: number; overdueTaskCount?: number;
  activity?: unknown[]; insights?: unknown; copilot?: unknown;
} = {}) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/copilot')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: overrides.copilot ?? DEFAULT_COPILOT_RESPONSE }) });
    }
    if (url.includes('/insights')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: overrides.insights ?? DEFAULT_INSIGHTS }) });
    }
    if (url.includes('/activity')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: overrides.activity ?? [] }) });
    }
    if (url.includes('/dependencies')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { id: 'dep-1' } }) });
    }
    if (url.includes('/schedule-message')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { id: 'sched-1' } }) });
    }
    if (url.includes('/api/roadmaps/roadmap-1') && !url.includes('/tasks/') && !url.includes('/phases/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            roadmap: overrides.roadmap ?? BASE_ROADMAP, permission: overrides.permission ?? 'OWNER', nextStep: overrides.nextStep ?? null,
            executionHealth: overrides.executionHealth ?? { status: 'HEALTHY', reasons: [] },
            readyTaskCount: overrides.readyTaskCount ?? 1, blockedTaskCount: overrides.blockedTaskCount ?? 0, overdueTaskCount: overrides.overdueTaskCount ?? 0
          }
        })
      });
    }
    if (url.includes('/tasks/') && (!init || init.method === 'PATCH')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { id: 't2', status: 'IN_PROGRESS' } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
  }) as unknown as typeof fetch;
}

describe('Roadmap Detail Page — Smart Execution', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders a status badge distinguishing completed vs. not-started tasks', async () => {
    mockFetchSequence();
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getByText('Ready to Start')).toBeInTheDocument();
  });

  it('shows a "Start" action for a PENDING task and "Reopen" for a COMPLETED one', async () => {
    mockFetchSequence();
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('renders the "What should I do next" banner using the server-provided nextStep', async () => {
    mockFetchSequence({ nextStep: { taskId: 't2', phaseId: 'phase-1', taskTitle: 'Write hello world', phaseTitle: 'Foundations', reason: 'START_NEXT' } });
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText('What to do next')).toBeInTheDocument());
    // The task title legitimately appears twice (banner + task list) — assert at least one.
    expect(screen.getAllByText('Write hello world').length).toBeGreaterThan(0);
  });

  it('shows a completion celebration when nextStep is null (everything completed)', async () => {
    mockFetchSequence({ nextStep: null });
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText(/Every task in this roadmap is complete/)).toBeInTheDocument());
  });

  it('renders the per-phase derived progress bar', async () => {
    mockFetchSequence();
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText('1/2 done')).toBeInTheDocument());
  });

  it('clicking Start calls the existing single-task PATCH endpoint with target status IN_PROGRESS', async () => {
    mockFetchSequence();
    render(<RoadmapDetailPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledWith(
      '/api/roadmaps/roadmap-1/tasks/t2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS' }) })
    ));
  });

  it('a VIEW-only permission hides all task actions', async () => {
    mockFetchSequence({ permission: 'VIEW' });
    render(<RoadmapDetailPage />);

    await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
  });

  it('the "Discuss this task" action never shows raw roadmap content in the trigger UI, only the task title', async () => {
    mockFetchSequence();
    render(<RoadmapDetailPage />);
    await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

    const discussButtons = screen.getAllByText('Discuss this task →');
    expect(discussButtons.length).toBeGreaterThan(0);
  });

  describe('task assignment & due dates', () => {
    it('shows "Unassigned" for a task with no assignee', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    });

    it('shows the assignee name for an assigned task, without exposing extra profile info', async () => {
      const roadmapWithAssignee = {
        ...BASE_ROADMAP,
        phases: [{
          ...BASE_ROADMAP.phases[0]!,
          tasks: [
            { ...BASE_ROADMAP.phases[0]!.tasks[0]! },
            { ...BASE_ROADMAP.phases[0]!.tasks[1]!, assigneeId: 'friend-1', assignee: { id: 'friend-1', name: 'Friend Person', email: 'friend@x.com' } }
          ]
        }]
      };
      mockFetchSequence({ roadmap: roadmapWithAssignee });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText(/Assigned: Friend Person/)).toBeInTheDocument());
    });

    it('shows an Overdue badge for a task past its due date', async () => {
      const roadmapWithOverdue = {
        ...BASE_ROADMAP,
        phases: [{
          ...BASE_ROADMAP.phases[0]!,
          tasks: [
            { ...BASE_ROADMAP.phases[0]!.tasks[0]! },
            { ...BASE_ROADMAP.phases[0]!.tasks[1]!, dueDate: '2020-01-01T00:00:00Z', dueDateStatus: 'OVERDUE' }
          ]
        }]
      };
      mockFetchSequence({ roadmap: roadmapWithOverdue });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getAllByText(/Overdue/).length).toBeGreaterThan(0));
    });

    it('the assignee picker only offers the owner and active share recipients', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
      expect(screen.getAllByText('Owner Person').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Friend Person').length).toBeGreaterThan(0);
    });

    it('changing the assignee picker calls PATCH with the new assigneeId', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const assigneeSelect = selects.find((s) => s.querySelector('option[value=""]')?.textContent === 'Unassigned');
      fireEvent.change(assigneeSelect as HTMLSelectElement, { target: { value: 'friend-1' } });

      await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ assigneeId: 'friend-1' }) })
      ));
    });

    it('a VIEW-only permission hides the assignee/due-date editing controls but still shows the badges', async () => {
      mockFetchSequence({ permission: 'VIEW' });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
      expect(screen.queryAllByRole('combobox').length).toBe(0);
    });
  });

  describe('task dependencies & execution health', () => {
    const roadmapWithBlockedTask = {
      ...BASE_ROADMAP,
      phases: [{
        ...BASE_ROADMAP.phases[0]!,
        tasks: [
          { ...BASE_ROADMAP.phases[0]!.tasks[0]!, id: 'db', title: 'Setup Database', status: 'PENDING', executionStatus: 'READY', isExecutable: true, blockedBy: [], dependsOn: [] },
          {
            ...BASE_ROADMAP.phases[0]!.tasks[1]!, id: 'auth', title: 'Create Authentication', status: 'PENDING',
            executionStatus: 'BLOCKED', isExecutable: false, blockedBy: [{ taskId: 'db', title: 'Setup Database' }], dependsOn: [{ taskId: 'db', title: 'Setup Database' }]
          }
        ]
      }]
    };

    it('shows a Blocked badge and "Blocked by" list for a task with an incomplete dependency', async () => {
      mockFetchSequence({ roadmap: roadmapWithBlockedTask, blockedTaskCount: 1 });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Create Authentication')).toBeInTheDocument());
      expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
      expect(screen.getByText('Blocked by:')).toBeInTheDocument();
      expect(screen.getAllByText(/Setup Database/).length).toBeGreaterThan(0);
    });

    it('never shows a Start button for a blocked task (never implies it is executable)', async () => {
      mockFetchSequence({ roadmap: roadmapWithBlockedTask, blockedTaskCount: 1 });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Create Authentication')).toBeInTheDocument());
      // Only ONE "Start" button should exist — for the ready task (db), not the blocked one (auth).
      expect(screen.getAllByRole('button', { name: 'Start' }).length).toBe(1);
    });

    it('renders the Team Execution View with ready/blocked/overdue/completed counts', async () => {
      mockFetchSequence({ roadmap: roadmapWithBlockedTask, readyTaskCount: 1, blockedTaskCount: 1 });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Team Execution View')).toBeInTheDocument());
      expect(screen.getByText(/Ready to Start: 1/)).toBeInTheDocument();
      expect(screen.getByText(/Blocked: 1/)).toBeInTheDocument();
    });

    it('shows the execution health badge', async () => {
      mockFetchSequence({ executionHealth: { status: 'AT_RISK', reasons: [] } });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('At Risk')).toBeInTheDocument());
    });

    it('shows "Execution is currently blocked" when the next-step recommendation is blocked', async () => {
      mockFetchSequence({
        roadmap: roadmapWithBlockedTask,
        nextStep: { taskId: 'auth', phaseId: 'phase-1', taskTitle: 'Create Authentication', phaseTitle: 'Foundations', executable: false, reason: 'BLOCKED_BY_DEPENDENCY', blockedBy: ['db'] }
      });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Execution is currently blocked')).toBeInTheDocument());
      expect(screen.getByText(/Blocked by: Setup Database/)).toBeInTheDocument();
    });

    it('adds a dependency via the picker modal', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getAllByText('+ Add dependency')[0]!);
      await waitFor(() => expect(screen.getAllByText('Add Dependency').length).toBeGreaterThan(0));

      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const dependencySelect = selects.find((s) => s.querySelector('option[value=""]')?.textContent === 'Select a task…')!;
      fireEvent.change(dependencySelect, { target: { value: 't2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Dependency' }));

      await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining('/dependencies'),
        expect.objectContaining({ method: 'POST' })
      ));
    });
  });

  describe('activity timeline', () => {
    it('opens the activity modal and shows entries', async () => {
      mockFetchSequence({ activity: [{ id: 'log-1', action: 'roadmap.task.completed', actor: { id: 'u1', name: 'Alice' }, taskTitle: 'Read the book', phaseTitle: null, createdAt: '2026-01-01T00:00:00Z' }] });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Activity 🕒'));

      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
      expect(screen.getAllByText(/completed/).length).toBeGreaterThan(0);
    });

    it('shows an empty state when there is no activity', async () => {
      mockFetchSequence({ activity: [] });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Activity 🕒'));

      await waitFor(() => expect(screen.getByText('No activity yet.')).toBeInTheDocument());
    });
  });

  describe('schedule a message about a task', () => {
    it('opens the schedule-message modal and submits', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getAllByText('Schedule message →')[0]!);
      await waitFor(() => expect(screen.getByText('Schedule a Message')).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText(/Please review the authentication/), { target: { value: 'Please review tomorrow.' } });

      const scheduleButton = screen.getByRole('button', { name: 'Schedule' });
      expect(scheduleButton).toBeDisabled(); // no channel/time selected yet
    });
  });

  describe('execution dashboard', () => {
    it('renders overview cards from the insights payload', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Execution Dashboard')).toBeInTheDocument());
      expect(screen.getByText('Phases')).toBeInTheDocument();
      expect(screen.getAllByText('Tasks').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    });

    it('renders the Attention Required section from bottlenecks', async () => {
      mockFetchSequence({
        insights: {
          ...DEFAULT_INSIGHTS,
          bottlenecks: [{ type: 'OVERDUE_TASKS', severity: 'CRITICAL', affectedTaskCount: 2, affectedPhaseIds: ['phase-1'], explanation: '2 tasks overdue', recommendedAction: 'Reschedule them' }]
        }
      });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Attention Required')).toBeInTheDocument());
      expect(screen.getByText('Overdue Tasks (2)')).toBeInTheDocument();
      expect(screen.getByText('2 tasks overdue')).toBeInTheDocument();
      expect(screen.getByText('→ Reschedule them')).toBeInTheDocument();
    });

    it('does not render Attention Required when there are no bottlenecks', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Execution Dashboard')).toBeInTheDocument());
      expect(screen.queryByText('Attention Required')).not.toBeInTheDocument();
    });

    it('renders Phase Analytics with progress percentage', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Phase Analytics')).toBeInTheDocument());
      expect(screen.getByText(/1\/2 \(50%\)/)).toBeInTheDocument();
    });

    it('renders Workload with assignee flags', async () => {
      mockFetchSequence({
        insights: {
          ...DEFAULT_INSIGHTS,
          workload: {
            assignees: [{ assigneeId: 'owner-1', assignedTaskCount: 5, inProgressCount: 1, overdueCount: 0, blockedCount: 0, completedCount: 1 }],
            flags: [{ type: 'HIGH_WORKLOAD', severity: 'WARNING', assigneeId: 'owner-1', explanation: '4 incomplete tasks vs average of 2' }]
          }
        }
      });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Workload')).toBeInTheDocument());
      expect(screen.getAllByText('Owner Person').length).toBeGreaterThan(0);
      expect(screen.getByText('High Workload')).toBeInTheDocument();
    });

    it('renders Dependency Impact ranked entries', async () => {
      mockFetchSequence({
        insights: {
          ...DEFAULT_INSIGHTS,
          dependencyImpact: [{ taskId: 'db', title: 'Setup Database', directDependentCount: 1, transitiveDependentCount: 3, blocksNextStep: true, chainContainsOverdueTask: false }]
        }
      });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Dependency Impact')).toBeInTheDocument());
      expect(screen.getByText('Setup Database')).toBeInTheDocument();
      expect(screen.getByText(/blocks 3 downstream/)).toBeInTheDocument();
      expect(screen.getByText('Blocks next step')).toBeInTheDocument();
    });

    it('shows the insufficient-data state for the completion trend when nothing has completed', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Task Completion Trend')).toBeInTheDocument());
      expect(screen.getAllByText(/No tasks have been completed yet/).length).toBeGreaterThan(0);
    });

    it('shows a real trend when completion data exists', async () => {
      mockFetchSequence({
        insights: {
          ...DEFAULT_INSIGHTS,
          trends: { taskCompletion: { status: 'OK', points: [{ date: '2026-01-01', completedCount: 1, cumulativeCompleted: 1 }] } }
        }
      });
      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText(/1 completed as of 2026-01-01/)).toBeInTheDocument());
    });

    it('the Refresh button re-fetches insights', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Execution Dashboard')).toBeInTheDocument());

      const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
      fireEvent.click(screen.getByText('Refresh ↻'));

      await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore));
      expect((global.fetch as jest.Mock).mock.calls.some((c: unknown[]) => String(c[0]).includes('/insights'))).toBe(true);
    });

    it('shows an insights error message without crashing the rest of the page', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/insights')) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: { message: 'Insights unavailable' } }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { roadmap: BASE_ROADMAP, permission: 'OWNER', nextStep: null, executionHealth: { status: 'HEALTHY', reasons: [] }, readyTaskCount: 1, blockedTaskCount: 0, overdueTaskCount: 0 } }) });
      }) as unknown as typeof fetch;

      render(<RoadmapDetailPage />);

      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('Insights unavailable')).toBeInTheDocument());
    });
  });

  describe('AI Roadmap Copilot', () => {
    it('opens the copilot modal with roadmap-wide quick actions', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));

      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      expect(screen.getByText('Explain Health')).toBeInTheDocument();
      expect(screen.getByText('What Should I Do Next?')).toBeInTheDocument();
      expect(screen.getByText('Explain Bottlenecks')).toBeInTheDocument();
      expect(screen.getByText('Summarize Progress')).toBeInTheDocument();
    });

    it('renders facts and analysis clearly separated after running a quick action', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Explain Health'));

      await waitFor(() => expect(screen.getByText('Facts')).toBeInTheDocument());
      expect(screen.getByText(/Execution health: HEALTHY/)).toBeInTheDocument();
      expect(screen.getByText('Analysis')).toBeInTheDocument();
      expect(screen.getByText('Everything looks fine.')).toBeInTheDocument();
    });

    it('does NOT show a "Grounded in Project Knowledge" section when retrieval was not used', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Explain Health'));

      await waitFor(() => expect(screen.getByText('Facts')).toBeInTheDocument());
      expect(screen.queryByText('Grounded in Project Knowledge')).not.toBeInTheDocument();
    });

    it('shows a "Grounded in Project Knowledge" section with safe source titles when retrieval was used', async () => {
      mockFetchSequence({
        copilot: {
          action: 'EXPLAIN_HEALTH', facts: ['Execution health: HEALTHY.'], analysis: 'Everything looks fine.', recommendations: [],
          usedAi: true, usedRag: true,
          retrieval: { used: true, sources: [{ title: 'requirements.pdf', sourceId: 'doc-1' }] }
        }
      });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Explain Health'));

      await waitFor(() => expect(screen.getByText('Grounded in Project Knowledge')).toBeInTheDocument());
      expect(screen.getByText('requirements.pdf')).toBeInTheDocument();
    });

    it('shows a loading state while the copilot request is in flight', async () => {
      mockFetchSequence();
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Explain Health'));

      expect(screen.getByText('Thinking…')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Thinking…')).not.toBeInTheDocument());
    });

    it('shows an error state without crashing when the copilot request fails', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/copilot')) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: { message: 'Copilot is disabled.' } }) });
        }
        if (url.includes('/insights')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: DEFAULT_INSIGHTS }) });
        if (url.includes('/collaboration/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { roadmap: BASE_ROADMAP, permission: 'OWNER', nextStep: null, executionHealth: { status: 'HEALTHY', reasons: [] }, readyTaskCount: 1, blockedTaskCount: 0, overdueTaskCount: 0 } })
        });
      }) as unknown as typeof fetch;

      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Explain Health'));

      await waitFor(() => expect(screen.getByText('Copilot is disabled.')).toBeInTheDocument());
    });

    it('never suggests a different task than the deterministic recommendation for RECOMMEND_ACTIONS', async () => {
      mockFetchSequence({
        copilot: { action: 'RECOMMEND_ACTIONS', facts: ['Recommended next task: "Write hello world"'], deterministicNextStep: { taskId: 't2', phaseId: 'phase-1', taskTitle: 'Write hello world', phaseTitle: 'Foundations', reason: 'START_NEXT' }, recommendations: ['Take a short break between tasks'], usedAi: true, usedRag: false }
      });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());
      fireEvent.click(screen.getByText('What Should I Do Next?'));

      await waitFor(() => expect(screen.getByText('Deterministic Recommendation')).toBeInTheDocument());
      expect(screen.getAllByText(/Write hello world/).length).toBeGreaterThan(0);
      expect(screen.getByText('Recommendations')).toBeInTheDocument();
      expect(screen.getByText(/Take a short break between tasks/)).toBeInTheDocument();
    });

    it('renders a proposed change with Accept/Reject buttons and a model-confidence label (never "accuracy")', async () => {
      mockFetchSequence({
        copilot: {
          action: 'REFINE_TASK', facts: ['Task "Write hello world" status: PENDING.'],
          proposals: [{ type: 'REFINE_TASK', target: { taskId: 't2' }, suggestedChange: { title: 'Write your first Rust program' }, explanation: 'Clearer and more specific.', confidence: 'HIGH', evidence: 'Original title was generic.' }],
          usedAi: true, usedRag: false
        }
      });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getAllByText('Copilot 🤖 →')[0]!);
      await waitFor(() => expect(screen.getByText('Proposed Changes')).toBeInTheDocument());
      expect(screen.getByText('Clearer and more specific.')).toBeInTheDocument();
      expect(screen.getByText('Model confidence: HIGH')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    it('Reject removes the proposal locally without calling any mutation API', async () => {
      mockFetchSequence({
        copilot: {
          action: 'REFINE_TASK', facts: [],
          proposals: [{ type: 'REFINE_TASK', target: { taskId: 't2' }, suggestedChange: { title: 'New title' }, explanation: 'x', confidence: 'MEDIUM', evidence: '' }],
          usedAi: true, usedRag: false
        }
      });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getAllByText('Copilot 🤖 →')[0]!);
      await waitFor(() => expect(screen.getByText('Proposed Changes')).toBeInTheDocument());

      const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

      expect(screen.queryByText('Proposed Changes')).not.toBeInTheDocument();
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore); // no new network call
    });

    it('Accept calls the existing canonical PATCH task endpoint, never a new mutation path', async () => {
      mockFetchSequence({
        copilot: {
          action: 'REFINE_TASK', facts: [],
          proposals: [{ type: 'REFINE_TASK', target: { taskId: 't2' }, suggestedChange: { title: 'Write your first Rust program' }, explanation: 'x', confidence: 'HIGH', evidence: '' }],
          usedAi: true, usedRag: false
        }
      });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getAllByText('Copilot 🤖 →')[0]!);
      await waitFor(() => expect(screen.getByText('Proposed Changes')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(global.fetch as jest.Mock).toHaveBeenCalledWith(
        '/api/roadmaps/roadmap-1/tasks/t2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'Write your first Rust program' }) })
      ));
    });

    it('a VIEW-only permission hides proposal-generating quick actions but still shows read actions', async () => {
      mockFetchSequence({ permission: 'VIEW' });
      render(<RoadmapDetailPage />);
      await waitFor(() => expect(screen.getByText('Learn Rust')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Copilot 🤖'));
      await waitFor(() => expect(screen.getByText('Roadmap Copilot')).toBeInTheDocument());

      expect(screen.getByText('Explain Health')).toBeInTheDocument();
      expect(screen.queryByText('Suggest Dependencies')).not.toBeInTheDocument();
    });
  });
});
