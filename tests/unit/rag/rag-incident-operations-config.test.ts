const mockGetBoolean = jest.fn();
jest.mock('@/features/config', () => ({
  configService: { getBoolean: (...args: unknown[]) => mockGetBoolean(...args) }
}));

import { loadRagIncidentOperationsConfig } from '@/features/rag/evaluation/rag-incident-operations-config';

describe('loadRagIncidentOperationsConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults both flags to false — conservative, matching every other RAG_HEALTH_* flag', async () => {
    mockGetBoolean.mockImplementation((_key: string, fallback: boolean) => Promise.resolve(fallback));

    const config = await loadRagIncidentOperationsConfig();

    expect(config).toEqual({ operationsEnabled: false, actionsEnabled: false });
  });

  it('reads each flag by its exact registered key', async () => {
    mockGetBoolean.mockResolvedValue(false);

    await loadRagIncidentOperationsConfig();

    expect(mockGetBoolean).toHaveBeenCalledWith('RAG_INCIDENT_OPERATIONS_ENABLED', false);
    expect(mockGetBoolean).toHaveBeenCalledWith('RAG_INCIDENT_ACTIONS_ENABLED', false);
  });
});
