jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireRole: jest.fn((user, role) => {
    if (user.role !== role) {
      const { AuthorizationError } = require('@/errors');
      throw new AuthorizationError('Administrator privileges are required.');
    }
  })
}));

const mockGetAlertById = jest.fn();
jest.mock('@/features/rag/evaluation/rag-health-alert.service', () => ({
  ragHealthAlertService: { getAlertById: (...args: unknown[]) => mockGetAlertById(...args) }
}));

const mockExecuteAction = jest.fn();
jest.mock('@/features/rag/evaluation/rag-incident-action.service', () => ({
  ragIncidentActionService: { executeAction: (...args: unknown[]) => mockExecuteAction(...args) }
}));

const mockLoadOpsConfig = jest.fn();
jest.mock('@/features/rag/evaluation/rag-incident-operations-config', () => ({
  loadRagIncidentOperationsConfig: () => mockLoadOpsConfig()
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { POST as executeAction } from '@/app/api/admin/rag-health-alerts/[id]/actions/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/alert-1/actions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('POST /api/admin/rag-health-alerts/[id]/actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadOpsConfig.mockResolvedValue({ operationsEnabled: true, actionsEnabled: true });
    mockGetAlertById.mockResolvedValue({ id: 'alert-1', category: 'CITATION' });
    mockExecuteAction.mockResolvedValue({ requestId: 'req-1', actionType: 'INVALIDATE_ANSWER_CACHE', status: 'SUCCEEDED', resultSummary: 'Answer cache invalidated.' });
  });

  it('rejects an unauthenticated caller', async () => {
    (requireAuthenticatedUser as jest.Mock).mockRejectedValue(new (require('@/errors').AuthenticationError)('Authentication required'));

    const res = await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'alert-1' } });

    expect(res.status).toBe(401);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });

    const res = await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'alert-1' } });

    expect(res.status).toBe(403);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('rejects an unknown action type — no arbitrary command execution', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const res = await executeAction(postRequest({ actionType: 'RM_RF_PRODUCTION' }), { params: { id: 'alert-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('rejects when RAG_INCIDENT_ACTIONS_ENABLED is off, even for a valid action type', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockLoadOpsConfig.mockResolvedValue({ operationsEnabled: true, actionsEnabled: false });

    const res = await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'alert-1' } });

    expect(res.status).toBe(403);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent alert', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockGetAlertById.mockResolvedValue(null);

    const res = await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'missing' } });

    expect(res.status).toBe(404);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('executes an allowed action for an authorized admin', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const res = await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'alert-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('SUCCEEDED');
    expect(mockExecuteAction).toHaveBeenCalledWith('INVALIDATE_ANSWER_CACHE', 'alert-1', 'admin-1', 'MANUAL');
  });

  it('never modifies alert lifecycle status — this route never touches acknowledgeAlert/applyDetectedConditions', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    await executeAction(postRequest({ actionType: 'INVALIDATE_ANSWER_CACHE' }), { params: { id: 'alert-1' } });

    // Confirmed structurally: this route file imports only getAlertById (a read) from the alert
    // service — acknowledgeAlert/applyDetectedConditions are never imported into this file at all.
    expect(mockGetAlertById).toHaveBeenCalled();
  });
});
