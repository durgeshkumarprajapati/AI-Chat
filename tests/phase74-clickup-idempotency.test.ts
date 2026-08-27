import { clickUpTaskService } from '@/features/meeting-intelligence/clickup/clickup-task.service';

jest.mock('@/features/meeting-intelligence/meeting-intelligence.repository', () => ({
  meetingIntelligenceRepository: {
    getTaskSuggestion: jest.fn().mockImplementation((id: string) => {
      if (id === 'task-already-created') {
        return Promise.resolve({
          id,
          userId: 'user-1',
          meetingId: 'meet-1',
          title: 'Existing Task',
          status: 'CREATED',
          clickUpTaskId: 'clickup-123',
          clickUpUrl: 'https://app.clickup.com/t/clickup-123',
          link: { id: 'link-1' }
        });
      }
      if (id === 'task-creating') {
        return Promise.resolve({
          id,
          userId: 'user-1',
          meetingId: 'meet-1',
          title: 'Creating Task',
          status: 'CREATING'
        });
      }
      return Promise.resolve({
        id,
        userId: 'user-1',
        meetingId: 'meet-1',
        title: 'New Task',
        status: 'PENDING'
      });
    }),
    getClickUpIntegration: jest.fn().mockResolvedValue({ accessToken: 'mock_token', workspaceId: 'ws-1' }),
    updateTaskSuggestion: jest.fn().mockResolvedValue({}),
    createClickUpLink: jest.fn().mockResolvedValue({ id: 'link-1' })
  }
}));

jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));

describe('Phase 74 — ClickUp Task Idempotency & Duplicate Prevention', () => {
  it('returns existing task link without re-triggering ClickUp API if already created', async () => {
    const res = await clickUpTaskService.createClickUpTaskFromSuggestion({
      userId: 'user-1',
      suggestionId: 'task-already-created'
    });

    expect(res.alreadyCreated).toBe(true);
    expect(res.clickUpTaskId).toBe('clickup-123');
  });

  it('rejects concurrent duplicate creation requests when status is CREATING', async () => {
    await expect(
      clickUpTaskService.createClickUpTaskFromSuggestion({
        userId: 'user-1',
        suggestionId: 'task-creating'
      })
    ).rejects.toThrow('already in progress');
  });

  it('creates task cleanly for pending suggestion', async () => {
    const res = await clickUpTaskService.createClickUpTaskFromSuggestion({
      userId: 'user-1',
      suggestionId: 'task-pending'
    });

    expect(res.alreadyCreated).toBe(false);
    expect(res.clickUpTaskId).toBeDefined();
  });
});
