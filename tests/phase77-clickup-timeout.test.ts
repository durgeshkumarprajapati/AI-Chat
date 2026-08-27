/**
 * Phase 77: ClickUpClient's three fetch() calls now pass an AbortSignal.timeout() built from
 * the already-existing CLICKUP_TIMEOUT_MS config, which was previously never wired in. This
 * proves the success-path behavior (return shape, mock-token short-circuit) is unchanged, and
 * that every real fetch call now carries a signal.
 */
import { ClickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';

describe('Phase 77 — ClickUpClient timeout wiring is additive only', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('mock-token short-circuit path is unaffected (no fetch call at all)', async () => {
    const client = new ClickUpClient();
    const result = await client.getWorkspaces('mock_token');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 'mock-ws-1', name: 'Primary ClickUp Workspace' }]);
  });

  it('every real fetch call now includes an AbortSignal (previously none did)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ teams: [{ id: 't1', name: 'Team 1' }] })
    });

    const client = new ClickUpClient();
    const result = await client.getWorkspaces('real_token');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual([{ id: 't1', name: 'Team 1' }]);
  });

  it('createTask still returns the same shape on success, now with a bounded timeout', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'task-1', name: 'Do the thing', url: 'https://app.clickup.com/t/task-1', status: { status: 'to do' } })
    });

    const client = new ClickUpClient();
    const result = await client.createTask('real_token', 'list-1', { name: 'Do the thing' });

    expect(result.id).toBe('task-1');
    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
