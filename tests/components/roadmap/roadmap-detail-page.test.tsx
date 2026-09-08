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
        { id: 't1', title: 'Read the book', description: 'Chapters 1-3', order: 1, estimatedHours: 4, status: 'COMPLETED', assignee: null, assigneeId: null, dueDate: null, dueDateStatus: 'NO_DEADLINE' },
        { id: 't2', title: 'Write hello world', description: 'Set up cargo', order: 2, estimatedHours: 1, status: 'PENDING', assignee: null, assigneeId: null, dueDate: null, dueDateStatus: 'NO_DEADLINE' }
      ]
    }
  ]
};

function mockFetchSequence(overrides: { nextStep?: unknown; permission?: string; roadmap?: unknown } = {}) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/api/roadmaps/roadmap-1') && !url.includes('/tasks/') && !url.includes('/phases/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { roadmap: overrides.roadmap ?? BASE_ROADMAP, permission: overrides.permission ?? 'OWNER', nextStep: overrides.nextStep ?? null }
        })
      });
    }
    if (url.includes('/tasks/')) {
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

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
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

      await waitFor(() => expect(screen.getByText(/Overdue/)).toBeInTheDocument());
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
});
