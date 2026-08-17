import { projectService } from '@/features/projects/project.service';
import { copilotMemoryService } from '../memory/copilot-memory.service';
import { env } from '@/config/env';

export interface CopilotContextBundle {
  userId: string;
  projectId?: string;
  projectSummary?: string;
  memories: string[];
  documents: { id: string; filename: string }[];
  roadmaps: { id: string; title: string }[];
  studySessions: { id: string; title: string; difficulty: string }[];
  formattedContext: string;
}

export class CopilotContextService {
  /**
   * Build dynamic context bundle within server token budget.
   */
  public async buildContext(userId: string, projectId?: string, _documentIds?: string[]): Promise<CopilotContextBundle> {
    const maxTokens = (env.server as any)?.COPILOT_MAX_CONTEXT_TOKENS || 12000;
    const memories = await copilotMemoryService.getMemories(userId, projectId);

    const memoryStrings = memories.slice(0, 10).map((m) => `${m.key}: ${m.value}`);

    let projectSummaryStr = '';
    let docList: { id: string; filename: string }[] = [];
    let roadmapList: { id: string; title: string }[] = [];
    let studyList: { id: string; title: string; difficulty: string }[] = [];

    if (projectId) {
      try {
        const p = await projectService.getProjectById(projectId, userId);
        projectSummaryStr = `Project: ${p.name} (${p.description || 'No description'}). Documents: ${p.documentCount}, Roadmaps: ${p.roadmapCount}, Study Sessions: ${p.studySessionCount}`;

        docList = p.documents.map((d) => ({ id: d.documentId, filename: d.filename }));
        roadmapList = p.roadmaps.map((r) => ({ id: r.roadmapId, title: r.title }));
        studyList = p.studySessions.map((s) => ({ id: s.studySessionId, title: s.title, difficulty: s.difficulty }));
      } catch (err) {
        console.warn('[CopilotContextService] Failed to load project context:', err);
      }
    }

    const lines: string[] = [];
    if (projectSummaryStr) {
      lines.push(`=== PROJECT CONTEXT ===\n${projectSummaryStr}`);
    }

    if (memoryStrings.length > 0) {
      lines.push(`=== USER PREFERENCES & MEMORY ===\n${memoryStrings.join('\n')}`);
    }

    if (docList.length > 0) {
      lines.push(`=== AVAILABLE DOCUMENTS ===\n${docList.map((d) => `- ${d.filename} (ID: ${d.id})`).join('\n')}`);
    }

    let fullContext = lines.join('\n\n');
    // Enforce token budget (rough char count heuristic: ~4 chars per token)
    const maxChars = maxTokens * 4;
    if (fullContext.length > maxChars) {
      fullContext = fullContext.substring(0, maxChars) + '\n...[Context Truncated to fit budget]';
    }

    return {
      userId,
      projectId,
      projectSummary: projectSummaryStr,
      memories: memoryStrings,
      documents: docList,
      roadmaps: roadmapList,
      studySessions: studyList,
      formattedContext: fullContext
    };
  }
}

export const copilotContextService = new CopilotContextService();
