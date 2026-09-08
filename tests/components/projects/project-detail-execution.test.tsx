import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import ProjectDetailPage from '@/app/projects/[id]/page';

const BASE_PROJECT = {
  id: 'project-1', ownerId: 'owner-1', name: 'Acme Launch', description: 'Launch plan', status: 'ACTIVE',
  createdAt: new Date(), updatedAt: new Date(), ownerName: 'Owner Person',
  memberCount: 2, documentCount: 0, knowledgeBaseCount: 0, roadmapCount: 1, studySessionCount: 0, researchSessionCount: 0, workflowCount: 0, conversationCount: 0,
  members: [], documents: [], knowledgeBases: [],
  roadmaps: [{ id: 'link-1', roadmapId: 'roadmap-1', title: 'Learn Rust', createdAt: new Date() }],
  studySessions: [], researchSessions: [], workflows: [], conversations: []
};

const DEFAULT_EXECUTION_SUMMARY = {
  status: 'HEALTHY',
  roadmapCount: 1,
  progress: { completed: 1, total: 2, percentage: 50 },
  attention: {
    blocked: { totalTasks: 0, roadmapIds: [] },
    overdue: { totalTasks: 0, roadmapIds: [] },
    dueSoon: { totalTasks: 0, roadmapIds: [] },
    unassigned: { totalTasks: 0, roadmapIds: [] }
  },
  roadmaps: [{
    roadmapId: 'roadmap-1', title: 'Learn Rust', status: 'HEALTHY',
    progress: { completed: 1, total: 2, percentage: 50 },
    blockedTasks: 0, overdueTasks: 0, dueSoonTasks: 0, unassignedTasks: 0,
    nextStep: { taskId: 't2', taskTitle: 'Write hello world', phaseTitle: 'Foundations' }
  }],
  topPriority: { roadmapId: 'roadmap-1', roadmapTitle: 'Learn Rust', taskId: 't2', taskTitle: 'Write hello world', reason: 'Continue with "Write hello world" in "Learn Rust".' },
  inaccessibleRoadmapCount: 0
};

function mockFetchSequence(overrides: { project?: unknown; execution?: unknown; executionOk?: boolean; executionError?: string } = {}) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/execution')) {
      if (overrides.executionOk === false) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: { message: overrides.executionError || 'Failed.' } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: overrides.execution ?? DEFAULT_EXECUTION_SUMMARY }) });
    }
    if (url.includes('/api/projects/project-1')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: overrides.project ?? BASE_PROJECT }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
  }) as unknown as typeof fetch;
}

describe('Project Detail Page — Execution Command Center', () => {
  it('shows a loading state while the execution summary is in flight', async () => {
    mockFetchSequence();
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText('Acme Launch')).toBeInTheDocument());
    expect(screen.getByText('Loading execution summary…')).toBeInTheDocument();
  });

  it('renders the overall health badge and progress once loaded', async () => {
    mockFetchSequence();
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0));
    expect(screen.getByText(/1\/2 tasks \(50%\)/)).toBeInTheDocument();
  });

  it('renders the Attention Required breakdown', async () => {
    mockFetchSequence({
      execution: {
        ...DEFAULT_EXECUTION_SUMMARY,
        attention: {
          blocked: { totalTasks: 2, roadmapIds: ['roadmap-1'] },
          overdue: { totalTasks: 1, roadmapIds: ['roadmap-1'] },
          dueSoon: { totalTasks: 3, roadmapIds: ['roadmap-1'] },
          unassigned: { totalTasks: 4, roadmapIds: ['roadmap-1'] }
        }
      }
    });
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText('Attention Required')).toBeInTheDocument());
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Due Soon')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders the Project Priority card with a navigation link to the relevant roadmap', async () => {
    mockFetchSequence();
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText('What should the team focus on next?')).toBeInTheDocument());
    expect(screen.getByText('Continue with "Write hello world" in "Learn Rust".')).toBeInTheDocument();
    const link = screen.getByText(/View in "Learn Rust"/);
    expect(link.closest('a')).toHaveAttribute('href', '/roadmaps/roadmap-1');
  });

  it('renders the per-roadmap overview with status/progress/next step', async () => {
    mockFetchSequence();
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText('Roadmap Overview')).toBeInTheDocument());
    expect(screen.getByText('Next: Write hello world')).toBeInTheDocument();
  });

  it('shows an explicit empty state when the project has zero accessible linked roadmaps', async () => {
    mockFetchSequence({ execution: { ...DEFAULT_EXECUTION_SUMMARY, roadmapCount: 0, roadmaps: [], topPriority: undefined } });
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText(/No accessible linked roadmaps yet/)).toBeInTheDocument());
    expect(screen.queryByText('Attention Required')).not.toBeInTheDocument();
  });

  it('shows an error state without crashing the rest of the page when the execution request fails', async () => {
    mockFetchSequence({ executionOk: false, executionError: 'The AI Roadmap Copilot is disabled.' });
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText('The AI Roadmap Copilot is disabled.')).toBeInTheDocument());
    // The rest of the page still renders normally.
    expect(screen.getByText('Learn Rust')).toBeInTheDocument();
  });

  it('mentions inaccessible roadmaps without exposing their identity', async () => {
    mockFetchSequence({ execution: { ...DEFAULT_EXECUTION_SUMMARY, inaccessibleRoadmapCount: 2 } });
    render(<ProjectDetailPage params={{ id: 'project-1' }} />);

    await waitFor(() => expect(screen.getByText(/2 linked roadmaps not shown/)).toBeInTheDocument());
  });
});
