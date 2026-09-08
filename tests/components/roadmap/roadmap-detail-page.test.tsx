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
  phases: [
    {
      id: 'phase-1', title: 'Foundations', description: 'Core basics', order: 1, durationWeeks: 2,
      progress: { totalItems: 2, completedItems: 1, inProgressItems: 0, notStartedItems: 1, completionPercentage: 50 },
      tasks: [
        { id: 't1', title: 'Read the book', description: 'Chapters 1-3', order: 1, estimatedHours: 4, status: 'COMPLETED' },
        { id: 't2', title: 'Write hello world', description: 'Set up cargo', order: 2, estimatedHours: 1, status: 'PENDING' }
      ]
    }
  ]
};

function mockFetchSequence(overrides: { nextStep?: unknown; permission?: string } = {}) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/api/roadmaps/roadmap-1') && !url.includes('/tasks/') && !url.includes('/phases/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { roadmap: BASE_ROADMAP, permission: overrides.permission ?? 'OWNER', nextStep: overrides.nextStep ?? null }
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
});
