import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';

describe('Phase 74 — ClickUp Client Integration', () => {
  it('creates ClickUp task using client provider', async () => {
    const res = await clickUpClient.createTask('mock_token', 'mock-list-1', {
      name: 'Refactor RAG Cache Provider',
      description: 'Optimize Redis TTL and single flight locks',
      dueDate: Date.now() + 86400000
    });

    expect(res.id).toBeDefined();
    expect(res.url).toContain('clickup.com');
    expect(res.name).toBe('Refactor RAG Cache Provider');
  });

  it('fetches workspaces and lists gracefully with simulated fallbacks', async () => {
    const workspaces = await clickUpClient.getWorkspaces('mock_token');
    const lists = await clickUpClient.getLists('mock_token', 'mock-ws-1');

    expect(workspaces.length).toBeGreaterThan(0);
    expect(lists.length).toBeGreaterThan(0);
  });
});
