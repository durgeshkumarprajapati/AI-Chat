import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';
import { ResearchMode, ResearchPlan, ResearchPlanTask, ResearchSourceMode, ResearchTaskType } from '../research.types';
import { RESEARCH_MODE_BUDGETS } from '../research.constants';
import { researchSecurityService } from '../security/research-security.service';

export class ResearchPlannerService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async generatePlan(params: {
    question: string;
    researchMode: ResearchMode;
    sourceMode: ResearchSourceMode;
    knowledgeBaseId?: string;
    roadmapId?: string;
    hasDocuments?: boolean;
    externalWebEnabled?: boolean;
  }): Promise<ResearchPlan> {
    const budget = RESEARCH_MODE_BUDGETS[params.researchMode] || RESEARCH_MODE_BUDGETS.STANDARD;
    const isWebAllowed = researchSecurityService.isWebSearchPermitted(params.sourceMode) && params.externalWebEnabled !== false;
    const isDocAllowed = researchSecurityService.isDocumentRetrievalPermitted(params.sourceMode);

    const prompt = `You are a Lead AI Research Analyst. Decompose this research question into a structured execution plan.
Research Question: "${params.question}"
Depth: ${params.researchMode} (Max search budget: ${budget.maxSearches})
Web Search Allowed: ${isWebAllowed}
Document Retrieval Allowed: ${isDocAllowed}

Allowed Task Types:
- "SEARCH" (Web search query)
- "DOCUMENT_RETRIEVAL" (Search internal uploaded documents / knowledge bases)
- "COMPARE" (Compare facts across sources)
- "VERIFY" (Verify claim against official sources)
- "GAP_ANALYSIS" (Check if evidence is sufficient)
- "VISUAL_ANALYSIS" (Analyze charts/tables/diagrams in evidence if applicable)
- "SUMMARIZE" (Synthesize final findings)

Instructions:
1. Generate 2 to ${budget.maxSearches} specific, non-duplicate tasks.
2. Ensure task priority is 1 to 5.
3. Output ONLY a valid JSON object matching this schema:
{
  "objective": "High-level goal summary",
  "tasks": [
    {
      "objective": "Task goal description",
      "type": "SEARCH",
      "priority": 1,
      "query": "Specific search terms"
    }
  ]
}
Do not include markdown code fence formatting outside the JSON object.`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only research planner. Output strict JSON objects.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        const validTasks: ResearchPlanTask[] = [];
        const seenObjectives = new Set<string>();

        for (const t of parsed.tasks) {
          if (!t.objective || seenObjectives.has(t.objective.toLowerCase())) continue;
          seenObjectives.add(t.objective.toLowerCase());

          let taskType = (t.type || 'SEARCH').toUpperCase() as ResearchTaskType;
          if (!Object.values(ResearchTaskType).includes(taskType)) {
            taskType = ResearchTaskType.SEARCH;
          }

          // Enforce source bounds on plan tasks
          if (taskType === ResearchTaskType.SEARCH && !isWebAllowed && isDocAllowed) {
            taskType = ResearchTaskType.DOCUMENT_RETRIEVAL;
          }

          validTasks.push({
            objective: String(t.objective).slice(0, 300),
            type: taskType,
            priority: Number(t.priority) || 1,
            query: t.query ? String(t.query).slice(0, 200) : String(t.objective).slice(0, 200),
            evidenceRequired: true
          });

          if (validTasks.length >= budget.maxSearches) break;
        }

        if (validTasks.length > 0) {
          return {
            objective: String(parsed.objective || params.question),
            tasks: validTasks
          };
        }
      }
    } catch (err) {
      console.warn('LLM plan generation failed, falling back to deterministic plan:', err);
    }

    // Deterministic Fallback Plan
    const fallbackTasks: ResearchPlanTask[] = [];
    if (isWebAllowed) {
      fallbackTasks.push({
        objective: `Search web evidence for: ${params.question}`,
        type: ResearchTaskType.SEARCH,
        priority: 1,
        query: params.question,
        evidenceRequired: true
      });
    }

    if (isDocAllowed) {
      fallbackTasks.push({
        objective: `Retrieve document evidence for: ${params.question}`,
        type: ResearchTaskType.DOCUMENT_RETRIEVAL,
        priority: 1,
        query: params.question,
        evidenceRequired: true
      });
    }

    fallbackTasks.push({
      objective: 'Analyze evidence and detect conflicts',
      type: ResearchTaskType.COMPARE,
      priority: 2,
      evidenceRequired: false
    });

    return {
      objective: params.question,
      tasks: fallbackTasks
    };
  }
}

export const researchPlannerService = new ResearchPlannerService();
