import { configService } from '@/features/config';
import { BottleneckPolicyConfig } from './roadmap-bottleneck-analysis';

export async function loadRoadmapBottleneckConfig(): Promise<BottleneckPolicyConfig> {
  const phaseStagnationDays = await configService.getNumber('ROADMAP_PHASE_STAGNATION_DAYS', 14);
  return { phaseStagnationDays };
}
