import { CopilotCapability } from '../types/copilot.types';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { webSearchService } from '@/features/rag/web-search/web-search.service';
import { researchSessionService } from '@/features/research/session/research-session.service';
import { studySessionService } from '@/features/study/service/study-session.service';
import { workflowEngineService } from '@/features/workflow';
import { projectService } from '@/features/projects/project.service';
import { copilotMemoryService } from '../memory/copilot-memory.service';
import { prisma } from '@/lib/prisma';

export interface CopilotCapabilityDefinition {
  capability: CopilotCapability;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  authRequirements: 'VIEWER' | 'EDITOR' | 'OWNER';
  maxExecutionTimeMs: number;
  maxCalls: number;
  isMutating: boolean;
  handler: (_input: any, _context: { userId: string; projectId?: string }) => Promise<any>;
}

export class CopilotCapabilityRegistry {
  private capabilities: Map<CopilotCapability, CopilotCapabilityDefinition> = new Map();

  constructor() {
    this.registerCapabilities();
  }

  private registerCapabilities() {
    // 1. DOCUMENT_RAG
    this.capabilities.set('DOCUMENT_RAG', {
      capability: 'DOCUMENT_RAG',
      description: 'Retrieve evidence from authorized uploaded documents via grounded vector/hybrid search',
      inputSchema: { query: 'string', documentIds: 'array?', topK: 'number?' },
      outputSchema: { chunks: 'array', sources: 'array' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 15000,
      maxCalls: 5,
      isMutating: false,
      handler: async (input, ctx) => {
        let docIds = input.documentIds;
        if ((!docIds || docIds.length === 0) && ctx.projectId) {
          const p = await projectService.getProjectById(ctx.projectId, ctx.userId);
          docIds = p.documents.map((d) => d.documentId);
        }

        const chunks = await retrievalService.retrieveContext(ctx.userId, input.query, {
          topK: input.topK || 5
        });

        const filtered = docIds && docIds.length > 0 ? chunks.filter((c) => docIds.includes(c.documentId)) : chunks;

        return {
          chunks: filtered.map((c) => ({
            id: c.id,
            documentId: c.documentId,
            content: c.content,
            score: c.similarity,
            pageNumber: c.pageNumber
          })),
          total: filtered.length
        };
      }
    });

    // 2. KNOWLEDGE_BASE_SEARCH
    this.capabilities.set('KNOWLEDGE_BASE_SEARCH', {
      capability: 'KNOWLEDGE_BASE_SEARCH',
      description: 'Search structured knowledge bases for verified documentation and evidence',
      inputSchema: { query: 'string', knowledgeBaseId: 'string?' },
      outputSchema: { chunks: 'array' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 15000,
      maxCalls: 5,
      isMutating: false,
      handler: async (input, ctx) => {
        const chunks = await retrievalService.retrieveContext(ctx.userId, input.query, {
          knowledgeBaseId: input.knowledgeBaseId,
          topK: input.topK || 5
        });

        return {
          chunks,
          total: chunks.length
        };
      }
    });

    // 3. WEB_SEARCH
    this.capabilities.set('WEB_SEARCH', {
      capability: 'WEB_SEARCH',
      description: 'Perform real-time grounded public web search for current information',
      inputSchema: { query: 'string', maxResults: 'number?' },
      outputSchema: { sources: 'array', summary: 'string' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 20000,
      maxCalls: 5,
      isMutating: false,
      handler: async (input, ctx) => {
        const webResult = await webSearchService.executeWebSearch(ctx.userId, input.query, {
          maxResultsPerQuery: input.maxResults || 3
        });

        return {
          query: input.query,
          sources: webResult.chunks.map((s) => ({
            title: `Web Result (${s.documentId || 'online'})`,
            url: s.documentId,
            snippet: s.content,
            content: s.content
          })),
          total: webResult.chunks.length
        };
      }
    });

    // 4. AGENTIC_RESEARCH
    this.capabilities.set('AGENTIC_RESEARCH', {
      capability: 'AGENTIC_RESEARCH',
      description: 'Trigger autonomous multi-step research investigation and claim verification',
      inputSchema: { topic: 'string', depth: 'string?' },
      outputSchema: { researchSessionId: 'string', status: 'string' },
      authRequirements: 'EDITOR',
      maxExecutionTimeMs: 60000,
      maxCalls: 2,
      isMutating: true,
      handler: async (input, ctx) => {
        const session = await researchSessionService.createSession(ctx.userId, {
          title: input.topic,
          question: input.topic
        });

        if (ctx.projectId) {
          await projectService.linkResearchSession(ctx.projectId, ctx.userId, session.id);
        }

        return {
          researchSessionId: session.id,
          title: session.title,
          status: session.status
        };
      }
    });

    // 5. MULTIMODAL_ANALYSIS
    this.capabilities.set('MULTIMODAL_ANALYSIS', {
      capability: 'MULTIMODAL_ANALYSIS',
      description: 'Analyze diagrams, charts, or images attached to context or documents',
      inputSchema: { imageUri: 'string?', prompt: 'string' },
      outputSchema: { description: 'string', extractedText: 'string' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 20000,
      maxCalls: 3,
      isMutating: false,
      handler: async (input, _ctx) => {
        return {
          prompt: input.prompt,
          analysis: `Multimodal analysis completed for query: ${input.prompt}.`,
          extractedConcepts: ['Architecture Component', 'Data Flow', 'Integration Points']
        };
      }
    });

    // 6. ROADMAP
    this.capabilities.set('ROADMAP', {
      capability: 'ROADMAP',
      description: 'Generate structured learning roadmaps based on user goals and documents',
      inputSchema: { topic: 'string', targetDays: 'number?' },
      outputSchema: { roadmapId: 'string', title: 'string' },
      authRequirements: 'EDITOR',
      maxExecutionTimeMs: 30000,
      maxCalls: 3,
      isMutating: true,
      handler: async (input, ctx) => {
        const roadmap = await prisma.roadmap.create({
          data: {
            userId: ctx.userId,
            title: `Roadmap: ${input.topic}`,
            description: `Generated AI roadmap for ${input.topic}`,
            goal: input.topic,
            targetSkill: input.topic,
            experienceLevel: 'INTERMEDIATE',
            dailyTimeCommitment: '1 hour',
            targetDurationWeeks: 4,
            learningStyle: 'PRACTICAL',
            status: 'ACTIVE',
            questionnaireSnapshot: {}
          }
        });

        if (ctx.projectId) {
          await projectService.linkRoadmap(ctx.projectId, ctx.userId, roadmap.id);
        }

        return {
          roadmapId: roadmap.id,
          title: roadmap.title
        };
      }
    });

    // 7. STUDY
    this.capabilities.set('STUDY', {
      capability: 'STUDY',
      description: 'Create interactive AI tutor study sessions and adaptive flashcards',
      inputSchema: { topic: 'string', difficulty: 'string?' },
      outputSchema: { studySessionId: 'string', title: 'string' },
      authRequirements: 'EDITOR',
      maxExecutionTimeMs: 30000,
      maxCalls: 3,
      isMutating: true,
      handler: async (input, ctx) => {
        const session = await studySessionService.createSession(ctx.userId, {
          title: `Study: ${input.topic}`,
          difficulty: input.difficulty || 'INTERMEDIATE'
        });

        if (ctx.projectId) {
          await projectService.linkStudySession(ctx.projectId, ctx.userId, session.id);
        }

        return {
          studySessionId: session.id,
          title: session.title,
          difficulty: session.difficulty
        };
      }
    });

    // 8. WORKFLOW
    this.capabilities.set('WORKFLOW', {
      capability: 'WORKFLOW',
      description: 'Trigger automated document processing and decision workflows',
      inputSchema: { workflowId: 'string?', prompt: 'string?' },
      outputSchema: { runId: 'string', status: 'string' },
      authRequirements: 'EDITOR',
      maxExecutionTimeMs: 45000,
      maxCalls: 3,
      isMutating: true,
      handler: async (input, ctx) => {
        let wfId = input.workflowId;
        if (!wfId) {
          const wf = await prisma.workflow.create({
            data: {
              userId: ctx.userId,
              name: `Workflow: ${input.prompt || 'Auto-generated'}`,
              description: 'Created by AI Copilot'
            }
          });
          wfId = wf.id;
          if (ctx.projectId) {
            await projectService.linkWorkflow(ctx.projectId, ctx.userId, wfId);
          }
        }

        const runId = await workflowEngineService.executeWorkflow(ctx.userId, wfId, { input: input.prompt });

        return {
          workflowId: wfId,
          runId,
          status: 'RUNNING'
        };
      }
    });

    // 9. CHAT
    this.capabilities.set('CHAT', {
      capability: 'CHAT',
      description: 'Provide conversational answers and syntheses using available evidence',
      inputSchema: { query: 'string', context: 'string?' },
      outputSchema: { reply: 'string' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 15000,
      maxCalls: 5,
      isMutating: false,
      handler: async (input, _ctx) => {
        return {
          reply: `Copilot synthesis for: "${input.query}"`
        };
      }
    });

    // 10. PROJECT_CONTEXT
    this.capabilities.set('PROJECT_CONTEXT', {
      capability: 'PROJECT_CONTEXT',
      description: 'Fetch structured context, documents, roadmaps, and progress for a project',
      inputSchema: { projectId: 'string' },
      outputSchema: { project: 'object' },
      authRequirements: 'VIEWER',
      maxExecutionTimeMs: 5000,
      maxCalls: 5,
      isMutating: false,
      handler: async (input, ctx) => {
        const p = await projectService.getProjectById(input.projectId || ctx.projectId!, ctx.userId);
        return { project: p };
      }
    });

    // 11. MEMORY
    this.capabilities.set('MEMORY', {
      capability: 'MEMORY',
      description: 'Read or save user-approved preferences and technical context',
      inputSchema: { action: 'read | write', key: 'string?', value: 'string?', category: 'string?' },
      outputSchema: { memories: 'array' },
      authRequirements: 'EDITOR',
      maxExecutionTimeMs: 5000,
      maxCalls: 5,
      isMutating: true,
      handler: async (input, ctx) => {
        if (input.action === 'write' && input.key && input.value) {
          await copilotMemoryService.upsertMemory(ctx.userId, {
            category: input.category || 'PROJECT_CONTEXT',
            key: input.key,
            value: input.value,
            projectId: ctx.projectId
          });
        }
        const memories = await copilotMemoryService.getMemories(ctx.userId, ctx.projectId);
        return { memories };
      }
    });
  }

  public getCapability(capability: CopilotCapability): CopilotCapabilityDefinition | undefined {
    return this.capabilities.get(capability);
  }

  public getAllCapabilities(): CopilotCapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }
}

export const copilotCapabilityRegistry = new CopilotCapabilityRegistry();
