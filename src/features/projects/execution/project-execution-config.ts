import { configService } from '@/features/config';

export interface ProjectExecutionConfig {
  maxRoadmaps: number;
}

export async function loadProjectExecutionConfig(): Promise<ProjectExecutionConfig> {
  const maxRoadmaps = await configService.getNumber('PROJECT_EXECUTION_MAX_ROADMAPS', 20);
  return { maxRoadmaps };
}
