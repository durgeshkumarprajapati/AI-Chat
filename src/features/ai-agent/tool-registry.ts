import { AgentRiskLevel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { ValidationError, NotFoundError } from '@/errors';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { projectService } from '@/features/projects/project.service';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { meetingIntelligenceRepository } from '@/features/meeting-intelligence/meeting-intelligence.repository';
import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';
import { googleCalendarService, CalendarEventDetails } from '@/features/calendar/google-calendar.service';
import { AgentToolContext } from './ai-agent.types';

/**
 * Phase 78C — the closed Tool Registry.
 *
 * SECURITY INVARIANT: this is the ONLY place the agent platform is allowed to call into other
 * services. Every entry is a statically-defined object with a real, hand-written async function —
 * there is no dynamic `eval`/`Function`/dynamic `require` anywhere in this file, and there must
 * never be. The planner (`planner.service.ts`) may only ever reference a `toolId` that exists as
 * a key of `TOOL_REGISTRY` below; the execution engine looks up tools ONLY by that key. An LLM
 * can never cause an arbitrary function to run — at most it can select among the tools below and
 * supply their declared inputs.
 *
 * DEFENSE IN DEPTH: every `execute()` re-verifies authorization itself. The planner and the
 * run/approval services already check authorization once at plan-creation time, but a tool must
 * never assume that check actually happened — it re-checks project access and re-resolves
 * credentials (OAuth tokens) internally, and NEVER accepts a token, project id override, or user
 * id override from the LLM-authored `input` — those always come from `ctx`, which is set by the
 * trusted run/execution layer from the run's own persisted `userId`/`projectId`, never from tool
 * input.
 *
 * TOKEN HYGIENE: no `execute()` below ever returns an OAuth access/refresh token, client secret,
 * or `Authorization` header value in its resolved output. ClickUp/Calendar tools fetch credentials
 * internally (via `meetingIntelligenceRepository.getClickUpIntegration` / the existing
 * `googleCalendarService`/`googleAuthService` token-refresh flow) and never let the raw token
 * value flow back out through the tool's return value.
 */

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  timeoutMs: number;
  idempotent: boolean;
  execute: (_ctx: AgentToolContext, _input: any) => Promise<any>;
}

/** Applies the project-scoped defense-in-depth authorization check, when a run is project-scoped.
 * Tools that make no sense without a project (e.g. `get_project_info`) additionally require
 * `ctx.projectId` to be set at all — that check lives in the tool itself. */
async function reauthorizeProjectIfScoped(
  ctx: AgentToolContext,
  permission: 'VIEW_PROJECT' | 'ASK_AI' | 'EDIT_PROJECT'
): Promise<void> {
  if (!ctx.projectId) return;
  await projectAuthorizationService.authorizeProjectAccess(ctx.userId, ctx.projectId, permission);
}

async function toolTimeoutMs(): Promise<number> {
  return configService.getNumber('AGENT_TOOL_TIMEOUT_MS', 20000);
}

const searchDocuments: AgentTool = {
  id: 'search_documents',
  name: 'Search Documents',
  description:
    'Searches the requesting user\'s own document knowledge base (RAG) for chunks relevant to a query. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The natural-language question or search query.' },
      topK: { type: 'number', description: 'Max number of chunks to return (optional).' }
    },
    required: ['query']
  },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 20000,
  idempotent: true,
  execute: async (ctx, input) => {
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    if (!query) throw new ValidationError('search_documents requires a non-empty "query" string.');
    // Never trust a tool-input-provided userId — always the requesting user's own id.
    const { chunks } = await retrievalService.retrieveContextWithTrace(ctx.userId, query, {
      topK: typeof input?.topK === 'number' ? input.topK : undefined
    });
    return {
      chunks: chunks.map((c) => ({
        documentId: c.documentId,
        filename: c.filename,
        pageNumber: c.pageNumber,
        content: c.content,
        similarity: c.similarity
      }))
    };
  }
};

const getProjectInfo: AgentTool = {
  id: 'get_project_info',
  name: 'Get Project Info',
  description: 'Reads basic details of the project this agent run is scoped to. Read-only.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 15000,
  idempotent: true,
  execute: async (ctx) => {
    if (!ctx.projectId) {
      throw new ValidationError('get_project_info requires the agent run to be scoped to a project.');
    }
    await projectAuthorizationService.authorizeProjectAccess(ctx.userId, ctx.projectId, 'VIEW_PROJECT');
    const project = await projectService.getProjectById(ctx.projectId, ctx.userId);
    return project;
  }
};

const getMeetingAnalysis: AgentTool = {
  id: 'get_meeting_analysis',
  name: 'Get Meeting Analysis',
  description:
    "Reads the stored AI analysis (summary, decisions, action items, risks, blockers) for one of the requesting user's own meetings. Read-only.",
  inputSchema: {
    type: 'object',
    properties: { meetingId: { type: 'string', description: 'The meeting id to look up.' } },
    required: ['meetingId']
  },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 15000,
  idempotent: true,
  execute: async (ctx, input) => {
    const meetingId = typeof input?.meetingId === 'string' ? input.meetingId : '';
    if (!meetingId) throw new ValidationError('get_meeting_analysis requires a "meetingId" string.');
    await reauthorizeProjectIfScoped(ctx, 'VIEW_PROJECT');

    // Never accept a raw meetingId without checking it belongs to this user/project first.
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        userId: ctx.userId,
        ...(ctx.projectId ? { projectId: ctx.projectId } : {})
      }
    });
    if (!meeting) throw new NotFoundError('Meeting');

    const analysis = await prisma.meetingAnalysis.findUnique({ where: { meetingId: meeting.id } });
    if (!analysis) throw new NotFoundError('Meeting analysis');

    return {
      meetingId: meeting.id,
      title: meeting.title,
      summary: analysis.summary,
      decisions: analysis.decisions,
      actionItems: analysis.actionItems,
      risks: analysis.risks,
      blockers: analysis.blockers,
      openQuestions: analysis.openQuestions
    };
  }
};

const getClickUpTaskStatus: AgentTool = {
  id: 'get_clickup_task_status',
  name: 'Get ClickUp Task Status',
  description:
    "Reads the requesting user's own ClickUp task list (statuses, due dates) for one ClickUp list id. Read-only.",
  inputSchema: {
    type: 'object',
    properties: { listId: { type: 'string', description: 'The ClickUp list id to read tasks from.' } },
    required: ['listId']
  },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 20000,
  idempotent: true,
  execute: async (ctx, input) => {
    const listId = typeof input?.listId === 'string' ? input.listId : '';
    if (!listId) throw new ValidationError('get_clickup_task_status requires a "listId" string.');
    await reauthorizeProjectIfScoped(ctx, 'VIEW_PROJECT');

    const integration = await meetingIntelligenceRepository.getClickUpIntegration(ctx.userId);
    if (!integration) {
      throw new ValidationError('ClickUp is not connected for this user.');
    }
    // Token stays local to this function call — never included in the returned value.
    const tasks = await clickUpClient.getTasksForList(integration.accessToken, listId);
    return { tasks };
  }
};

const getCalendarEvents: AgentTool = {
  id: 'get_calendar_events',
  name: 'Get Calendar Events',
  description: "Reads the requesting user's own upcoming Google Calendar events in a time window. Read-only.",
  inputSchema: {
    type: 'object',
    properties: {
      timeMinIso: { type: 'string', description: 'ISO 8601 lower bound.' },
      timeMaxIso: { type: 'string', description: 'ISO 8601 upper bound.' },
      maxResults: { type: 'number', description: 'Max events to return (optional).' }
    },
    required: ['timeMinIso', 'timeMaxIso']
  },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 20000,
  idempotent: true,
  execute: async (ctx, input) => {
    const timeMinIso = typeof input?.timeMinIso === 'string' ? input.timeMinIso : '';
    const timeMaxIso = typeof input?.timeMaxIso === 'string' ? input.timeMaxIso : '';
    if (!timeMinIso || !timeMaxIso) {
      throw new ValidationError('get_calendar_events requires "timeMinIso" and "timeMaxIso" strings.');
    }
    await reauthorizeProjectIfScoped(ctx, 'VIEW_PROJECT');

    const result = await googleCalendarService.getUpcomingEvents(
      ctx.userId,
      timeMinIso,
      timeMaxIso,
      typeof input?.maxResults === 'number' ? input.maxResults : undefined
    );
    if (!result.success) {
      throw new ValidationError(`Calendar read failed: ${result.error}`);
    }
    return { events: result.events };
  }
};

const getKnowledgeGraphContext: AgentTool = {
  id: 'get_knowledge_graph_context',
  name: 'Get Knowledge Graph Context',
  description:
    "Reads entities from the requesting user's own knowledge graph, optionally filtered by name and scoped to the run's project. Read-only.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional substring to filter entity names by.' },
      limit: { type: 'number', description: 'Max entities to return (optional, default 20).' }
    },
    required: []
  },
  riskLevel: 'READ_ONLY',
  requiresApproval: false,
  timeoutMs: 15000,
  idempotent: true,
  execute: async (ctx, input) => {
    await reauthorizeProjectIfScoped(ctx, 'VIEW_PROJECT');
    const limit = typeof input?.limit === 'number' ? Math.max(1, Math.min(input.limit, 50)) : 20;
    const query = typeof input?.query === 'string' ? input.query.trim() : '';

    const entities = await prisma.knowledgeEntity.findMany({
      where: {
        userId: ctx.userId,
        ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
        ...(query ? { canonicalName: { contains: query, mode: 'insensitive' } } : {})
      },
      take: limit,
      orderBy: { updatedAt: 'desc' }
    });

    return {
      entities: entities.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        entityType: e.entityType,
        description: e.description,
        confidence: e.confidence
      }))
    };
  }
};

const createClickUpTask: AgentTool = {
  id: 'create_clickup_task',
  name: 'Create ClickUp Task',
  description:
    "Creates a new task in the requesting user's ClickUp workspace. Side-effecting external action — always requires human approval.",
  inputSchema: {
    type: 'object',
    properties: {
      listId: { type: 'string', description: 'The ClickUp list id to create the task in.' },
      name: { type: 'string', description: 'Task title.' },
      description: { type: 'string', description: 'Task description (optional).' },
      dueDate: { type: 'number', description: 'Due date as epoch ms (optional).' },
      priority: { type: 'number', description: 'ClickUp priority level (optional).' }
    },
    required: ['listId', 'name']
  },
  // MEDIUM: creates real state in an external system the user's team may see/act on, but it is a
  // single additive record (not a delete/overwrite) and is scoped to the user's own connected
  // workspace — judged MEDIUM rather than HIGH/CRITICAL, consistent with `update_clickup_task`.
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  timeoutMs: 20000,
  idempotent: false,
  execute: async (ctx, input) => {
    const listId = typeof input?.listId === 'string' ? input.listId : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!listId || !name) {
      throw new ValidationError('create_clickup_task requires "listId" and "name" strings.');
    }
    await reauthorizeProjectIfScoped(ctx, 'EDIT_PROJECT');

    const integration = await meetingIntelligenceRepository.getClickUpIntegration(ctx.userId);
    if (!integration) {
      throw new ValidationError('ClickUp is not connected for this user.');
    }
    const task = await clickUpClient.createTask(integration.accessToken, listId, {
      name,
      description: typeof input?.description === 'string' ? input.description : undefined,
      dueDate: typeof input?.dueDate === 'number' ? input.dueDate : undefined,
      priority: typeof input?.priority === 'number' ? input.priority : undefined
    });
    return { id: task.id, name: task.name, url: task.url, status: task.status };
  }
};

const updateClickUpTask: AgentTool = {
  id: 'update_clickup_task',
  name: 'Update ClickUp Task',
  description:
    "Updates an existing task in the requesting user's ClickUp workspace. Side-effecting external action — always requires human approval.",
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ClickUp task id to update.' },
      name: { type: 'string', description: 'New task title (optional).' },
      description: { type: 'string', description: 'New task description (optional).' },
      status: { type: 'string', description: 'New status (optional).' },
      dueDate: { type: 'number', description: 'New due date as epoch ms (optional).' },
      priority: { type: 'number', description: 'New priority level (optional).' }
    },
    required: ['taskId']
  },
  // MEDIUM: mutates an existing external record but does not delete data, and ClickUp itself
  // retains history/undo — same tier as create_clickup_task, for consistency.
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  timeoutMs: 20000,
  idempotent: false,
  execute: async (ctx, input) => {
    const taskId = typeof input?.taskId === 'string' ? input.taskId : '';
    if (!taskId) throw new ValidationError('update_clickup_task requires a "taskId" string.');
    await reauthorizeProjectIfScoped(ctx, 'EDIT_PROJECT');

    const integration = await meetingIntelligenceRepository.getClickUpIntegration(ctx.userId);
    if (!integration) {
      throw new ValidationError('ClickUp is not connected for this user.');
    }
    const task = await clickUpClient.updateTask(integration.accessToken, taskId, {
      name: typeof input?.name === 'string' ? input.name : undefined,
      description: typeof input?.description === 'string' ? input.description : undefined,
      status: typeof input?.status === 'string' ? input.status : undefined,
      dueDate: typeof input?.dueDate === 'number' ? input.dueDate : undefined,
      priority: typeof input?.priority === 'number' ? input.priority : undefined
    });
    return { id: task.id, name: task.name, url: task.url, status: task.status };
  }
};

const createCalendarEvent: AgentTool = {
  id: 'create_calendar_event',
  name: 'Create Calendar Event',
  description:
    "Creates a new event on the requesting user's Google Calendar. Side-effecting external action — always requires human approval.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title.' },
      description: { type: 'string', description: 'Event description (optional).' },
      location: { type: 'string', description: 'Event location (optional).' },
      startTime: { type: 'string', description: 'ISO 8601 start time.' },
      endTime: { type: 'string', description: 'ISO 8601 end time.' },
      timeZone: { type: 'string', description: 'IANA time zone (optional).' },
      createConference: { type: 'boolean', description: 'Whether to attach a Google Meet link (optional).' },
      attendeeEmails: { type: 'array', items: { type: 'string' }, description: 'Attendee emails (optional).' }
    },
    required: ['title', 'startTime', 'endTime']
  },
  // MEDIUM: creates a real calendar invite that may notify attendees, but is reversible-ish
  // (deletable/editable) and does not destroy existing data.
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  timeoutMs: 20000,
  idempotent: false,
  execute: async (ctx, input) => {
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    const startTimeRaw = typeof input?.startTime === 'string' ? input.startTime : '';
    const endTimeRaw = typeof input?.endTime === 'string' ? input.endTime : '';
    if (!title || !startTimeRaw || !endTimeRaw) {
      throw new ValidationError('create_calendar_event requires "title", "startTime", and "endTime".');
    }
    const startTime = new Date(startTimeRaw);
    const endTime = new Date(endTimeRaw);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new ValidationError('create_calendar_event received an unparsable "startTime"/"endTime".');
    }
    await reauthorizeProjectIfScoped(ctx, 'EDIT_PROJECT');

    const event: CalendarEventDetails = {
      title,
      description: typeof input?.description === 'string' ? input.description : undefined,
      location: typeof input?.location === 'string' ? input.location : undefined,
      startTime,
      endTime,
      timeZone: typeof input?.timeZone === 'string' ? input.timeZone : undefined,
      createConference: typeof input?.createConference === 'boolean' ? input.createConference : undefined
    };
    const attendeeEmails: string[] = Array.isArray(input?.attendeeEmails)
      ? input.attendeeEmails.filter((e: unknown) => typeof e === 'string')
      : [];

    const result = await googleCalendarService.createCalendarEventViaApi(ctx.userId, event, attendeeEmails);
    if (!result.success) {
      throw new ValidationError(`Calendar event creation failed: ${result.error}`);
    }
    return { eventId: result.eventId, htmlLink: result.htmlLink, meetUrl: result.meetUrl };
  }
};

/** The closed registry. Keys MUST equal each tool's own `id`. Nothing outside this file may add
 * to this map, and nothing in this codebase should construct an `AgentTool` anywhere else. */
export const TOOL_REGISTRY: Record<string, AgentTool> = {
  [searchDocuments.id]: searchDocuments,
  [getProjectInfo.id]: getProjectInfo,
  [getMeetingAnalysis.id]: getMeetingAnalysis,
  [getClickUpTaskStatus.id]: getClickUpTaskStatus,
  [getCalendarEvents.id]: getCalendarEvents,
  [getKnowledgeGraphContext.id]: getKnowledgeGraphContext,
  [createClickUpTask.id]: createClickUpTask,
  [updateClickUpTask.id]: updateClickUpTask,
  [createCalendarEvent.id]: createCalendarEvent
};

export function getRegisteredTool(toolId: string): AgentTool | undefined {
  return TOOL_REGISTRY[toolId];
}

export function listRegisteredTools(): AgentTool[] {
  return Object.values(TOOL_REGISTRY);
}

export { toolTimeoutMs };
