import { configService } from '@/features/config';

export interface RagIncidentOperationsConfig {
  operationsEnabled: boolean;
  actionsEnabled: boolean;
}

export async function loadRagIncidentOperationsConfig(): Promise<RagIncidentOperationsConfig> {
  const [operationsEnabled, actionsEnabled] = await Promise.all([
    configService.getBoolean('RAG_INCIDENT_OPERATIONS_ENABLED', false),
    configService.getBoolean('RAG_INCIDENT_ACTIONS_ENABLED', false)
  ]);
  return { operationsEnabled, actionsEnabled };
}
