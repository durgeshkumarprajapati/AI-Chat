const mockLogEvent = jest.fn();
const mockGetAuditLogs = jest.fn();
jest.mock('@/features/audit/audit.service', () => ({
  auditService: {
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    getAuditLogs: (...args: unknown[]) => mockGetAuditLogs(...args)
  }
}));

const mockInvalidateAll = jest.fn();
jest.mock('@/features/config', () => ({
  configCacheService: { invalidateAll: (...args: unknown[]) => mockInvalidateAll(...args) }
}));

const mockInvalidateDocument = jest.fn();
jest.mock('@/features/rag/cache/rag-cache.factory', () => ({
  getRAGCacheProvider: () => ({ invalidateDocument: (...args: unknown[]) => mockInvalidateDocument(...args) })
}));

const mockPublishToQueue = jest.fn();
jest.mock('@/lib/rabbitmq', () => ({
  rabbitmq: { publishToQueue: (...args: unknown[]) => mockPublishToQueue(...args) },
  QUEUES: { RAG_INCIDENT_ACTION: 'rag-incident-action' }
}));

import { ragIncidentActionService } from '@/features/rag/evaluation/rag-incident-action.service';

describe('RagIncidentActionService.executeAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateAll.mockResolvedValue(undefined);
    mockInvalidateDocument.mockResolvedValue(undefined);
    mockPublishToQueue.mockResolvedValue(undefined);
    mockLogEvent.mockResolvedValue(undefined);
  });

  it('rejects an unknown action type before executing anything', async () => {
    const result = await ragIncidentActionService.executeAction('DELETE_EVERYTHING', 'alert-1', 'admin-1');

    expect(result.status).toBe('FAILED');
    expect(mockInvalidateAll).not.toHaveBeenCalled();
    expect(mockInvalidateDocument).not.toHaveBeenCalled();
    expect(mockPublishToQueue).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('executes INVALIDATE_ANSWER_CACHE synchronously and records a SUCCEEDED audit entry', async () => {
    const result = await ragIncidentActionService.executeAction('INVALIDATE_ANSWER_CACHE', 'alert-1', 'admin-1');

    expect(mockInvalidateDocument).toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'RAG_INCIDENT_ACTION',
      targetType: 'RagHealthAlert',
      targetId: 'alert-1',
      details: expect.objectContaining({ actionType: 'INVALIDATE_ANSWER_CACHE', status: 'SUCCEEDED' })
    }));
  });

  it('executes REFRESH_CONFIG_CACHE synchronously and records a SUCCEEDED audit entry', async () => {
    const result = await ragIncidentActionService.executeAction('REFRESH_CONFIG_CACHE', 'alert-1', 'admin-1');

    expect(mockInvalidateAll).toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
  });

  it('a successful synchronous action enqueues a best-effort follow-up health re-evaluation', async () => {
    await ragIncidentActionService.executeAction('INVALIDATE_ANSWER_CACHE', 'alert-1', 'admin-1');
    // Follow-up is fire-and-forget; flush microtasks.
    await new Promise((r) => setImmediate(r));

    expect(mockPublishToQueue).toHaveBeenCalledWith('rag-incident-action', expect.objectContaining({
      actionType: 'RERUN_HEALTH_EVALUATION', trigger: 'AUTOMATIC_FOLLOW_UP', alertId: 'alert-1', initiatedBy: 'admin-1'
    }));
  });

  it('a synchronous action failure is recorded safely, without leaking the raw error message', async () => {
    mockInvalidateDocument.mockRejectedValue(new Error('Redis internal stack trace: connection pool exhausted at 0x7f3a'));

    const result = await ragIncidentActionService.executeAction('INVALIDATE_ANSWER_CACHE', 'alert-1', 'admin-1');

    expect(result.status).toBe('FAILED');
    expect(result.resultSummary).not.toMatch(/stack trace|0x7f3a|connection pool/);
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ status: 'FAILED' })
    }));
    const loggedDetails = mockLogEvent.mock.calls[0][0].details;
    expect(JSON.stringify(loggedDetails)).not.toMatch(/stack trace|0x7f3a|connection pool/);
  });

  it('RERUN_HEALTH_EVALUATION is queued (REQUESTED), not executed inline', async () => {
    const result = await ragIncidentActionService.executeAction('RERUN_HEALTH_EVALUATION', 'alert-1', 'admin-1');

    expect(result.status).toBe('REQUESTED');
    expect(mockPublishToQueue).toHaveBeenCalledWith('rag-incident-action', expect.objectContaining({
      jobType: 'RAG_INCIDENT_ACTION', actionType: 'RERUN_HEALTH_EVALUATION', alertId: 'alert-1', initiatedBy: 'admin-1', trigger: 'MANUAL'
    }));
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ status: 'REQUESTED' })
    }));
  });

  it('a queue-publish failure for a background action is recorded as FAILED, safely', async () => {
    mockPublishToQueue.mockRejectedValue(new Error('amqp connection refused'));

    const result = await ragIncidentActionService.executeAction('RERUN_HEALTH_EVALUATION', 'alert-1', 'admin-1');

    expect(result.status).toBe('FAILED');
    expect(result.resultSummary).not.toMatch(/amqp|connection refused/);
  });

  it('every action result and audit-log entry carries a requestId for lifecycle correlation', async () => {
    const result = await ragIncidentActionService.executeAction('REFRESH_CONFIG_CACHE', 'alert-1', 'admin-1');

    expect(result.requestId).toEqual(expect.any(String));
    expect(result.requestId.length).toBeGreaterThan(0);
  });
});

describe('RagIncidentActionService.listRecentActions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries the existing audit log scoped to this action type and alert id — no duplicate record store', async () => {
    mockGetAuditLogs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    await ragIncidentActionService.listRecentActions('alert-1');

    expect(mockGetAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ action: 'RAG_INCIDENT_ACTION', targetId: 'alert-1' }));
  });

  it('maps audit rows into a flat, safe shape', async () => {
    mockGetAuditLogs.mockResolvedValue({
      items: [{ id: 'log-1', actorId: 'admin-1', action: 'RAG_INCIDENT_ACTION', targetType: 'RagHealthAlert', targetId: 'alert-1', details: { actionType: 'INVALIDATE_ANSWER_CACHE', status: 'SUCCEEDED', resultSummary: 'Answer cache invalidated.' }, createdAt: new Date() }],
      total: 1, page: 1, pageSize: 10
    });

    const result = await ragIncidentActionService.listRecentActions('alert-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ actionType: 'INVALIDATE_ANSWER_CACHE', status: 'SUCCEEDED', initiatedBy: 'admin-1' });
  });
});
