import { configService } from '@/features/config';

export interface RoadmapCopilotRagConfig {
  enabled: boolean;
  maxDocuments: number;
  maxExcerpts: number;
  maxExcerptChars: number;
  maxContextChars: number;
}

export async function loadRoadmapCopilotRagConfig(): Promise<RoadmapCopilotRagConfig> {
  const [enabled, maxDocuments, maxExcerpts, maxExcerptChars, maxContextChars] = await Promise.all([
    configService.getBoolean('ROADMAP_COPILOT_RAG_ENABLED', false),
    configService.getNumber('ROADMAP_COPILOT_RAG_MAX_DOCUMENTS', 3),
    configService.getNumber('ROADMAP_COPILOT_RAG_MAX_EXCERPTS', 3),
    configService.getNumber('ROADMAP_COPILOT_RAG_MAX_EXCERPT_CHARS', 400),
    configService.getNumber('ROADMAP_COPILOT_RAG_MAX_CONTEXT_CHARS', 3000)
  ]);
  return { enabled, maxDocuments, maxExcerpts, maxExcerptChars, maxContextChars };
}
