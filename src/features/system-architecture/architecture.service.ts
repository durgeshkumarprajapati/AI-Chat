import { env } from '@/config/env';
import { SYSTEM_NODES_REGISTRY, SYSTEM_EDGES_REGISTRY } from './architecture-registry';
import { SystemArchitectureGraphDTO, ArchitectureNodeDTO } from './architecture.types';

export class ArchitectureService {
  public getSystemArchitectureGraph(): SystemArchitectureGraphDTO {
    const nodes = SYSTEM_NODES_REGISTRY.map((node) => {
      let isEnabled = true;
      if (node.id === 'meeting-intelligence') {
        isEnabled = env.server?.MEETING_INTELLIGENCE_ENABLED ?? true;
      } else if (node.id === 'clickup-integration') {
        isEnabled = env.server?.CLICKUP_ENABLED ?? true;
      } else if (node.id === 'gemini-provider') {
        isEnabled = Boolean(env.server?.GEMINI_ENABLED && env.server?.GEMINI_API_KEY);
      } else if (node.id === 'deepseek-provider') {
        isEnabled = Boolean(env.server?.DEEPSEEK_ENABLED && env.server?.DEEPSEEK_API_KEY);
      } else if (node.id === 'web-intelligence') {
        isEnabled = Boolean(env.server?.WEB_SEARCH_ENABLED);
      }

      return {
        ...node,
        status: (isEnabled ? (node.status || 'ENABLED') : 'DISABLED') as ArchitectureNodeDTO['status']
      };
    });

    return {
      nodes,
      edges: SYSTEM_EDGES_REGISTRY,
      generatedAt: new Date().toISOString(),
      systemStatus: {
        application: 'HEALTHY',
        llmGateway: 'OPERATIONAL',
        database: 'CONNECTED',
        cache: 'ACTIVE',
        meetingIntelligence: env.server?.MEETING_INTELLIGENCE_ENABLED ? 'ACTIVE' : 'DISABLED',
        clickupIntegration: env.server?.CLICKUP_ENABLED ? 'ACTIVE' : 'DISABLED'
      }
    };
  }
}

export const architectureService = new ArchitectureService();
