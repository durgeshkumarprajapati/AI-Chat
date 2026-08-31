import { env } from '@/config/env';
import {
  CreateClickUpTaskPayload,
  ClickUpTaskResponseDTO,
  ClickUpWorkspaceDTO,
  ClickUpListDTO,
  ClickUpTaskDTO,
  UpdateClickUpTaskPayload
} from './clickup.types';

export class ClickUpClient {
  private baseUrl: string;
  // Phase 77: CLICKUP_TIMEOUT_MS already existed in env.ts/config but was never actually wired
  // into any fetch() call below — every request could hang indefinitely. This only changes the
  // failure/hang path: getWorkspaces/getLists already catch-and-fall-back to mock data on ANY
  // error, so a timeout just makes that existing fallback trigger reliably instead of never;
  // createTask had no bound at all before, so a caller awaiting a stalled ClickUp request would
  // hang forever — this bounds that to the same existing default (15s) other providers use.
  private timeoutMs: number;

  constructor() {
    this.baseUrl = env.server?.CLICKUP_API_BASE_URL || 'https://api.clickup.com/api/v2';
    this.timeoutMs = env.server?.CLICKUP_TIMEOUT_MS ?? 15000;
  }

  public async getWorkspaces(accessToken: string): Promise<ClickUpWorkspaceDTO[]> {
    if (!accessToken || accessToken.startsWith('mock_')) {
      return [{ id: 'mock-ws-1', name: 'Primary ClickUp Workspace' }];
    }

    try {
      const res = await fetch(`${this.baseUrl}/team`, {
        headers: { Authorization: accessToken },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      const data = await res.json();
      return (data.teams || []).map((t: any) => ({ id: t.id, name: t.name }));
    } catch {
      return [{ id: 'mock-ws-1', name: 'Primary ClickUp Workspace' }];
    }
  }

  public async getLists(accessToken: string, workspaceId: string): Promise<ClickUpListDTO[]> {
    if (!accessToken || accessToken.startsWith('mock_')) {
      return [{ id: 'mock-list-1', name: 'Action Items', spaceName: 'Engineering', folderName: 'Sprint 2026' }];
    }

    try {
      const res = await fetch(`${this.baseUrl}/team/${workspaceId}/space`, {
        headers: { Authorization: accessToken },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      const data = await res.json();
      const lists: ClickUpListDTO[] = [];
      for (const space of data.spaces || []) {
        lists.push({ id: space.id, name: space.name, spaceName: space.name });
      }
      return lists.length ? lists : [{ id: 'mock-list-1', name: 'Action Items' }];
    } catch {
      return [{ id: 'mock-list-1', name: 'Action Items' }];
    }
  }

  public async createTask(
    accessToken: string,
    listId: string,
    payload: CreateClickUpTaskPayload
  ): Promise<ClickUpTaskResponseDTO> {
    if (!accessToken || accessToken.startsWith('mock_')) {
      const mockId = `clickup-task-${Date.now()}`;
      return {
        id: mockId,
        name: payload.name,
        url: `https://app.clickup.com/t/${mockId}`,
        status: { status: 'to do' }
      };
    }

    const res = await fetch(`${this.baseUrl}/list/${listId}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: accessToken
      },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        due_date: payload.dueDate
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`ClickUp API Error (${res.status}): ${errorText}`);
    }

    return res.json();
  }

  // Phase 78 — additive, read-only. Needed by Project Intelligence (deadline/blocker
  // detection) and the AI Agent's read-only "get task status" tool. Mirrors the
  // mock-token/timeout/error-handling conventions of the methods above exactly.
  public async getTasksForList(accessToken: string, listId: string): Promise<ClickUpTaskDTO[]> {
    if (!accessToken || accessToken.startsWith('mock_')) {
      return [];
    }

    try {
      const res = await fetch(`${this.baseUrl}/list/${listId}/task?include_closed=true`, {
        headers: { Authorization: accessToken },
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!res.ok) {
        return [];
      }

      const data = await res.json();
      return (data.tasks || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        url: t.url,
        status: t.status?.status || 'unknown',
        dueDate: t.due_date ? Number(t.due_date) : null,
        dateUpdated: t.date_updated ? Number(t.date_updated) : null,
        listId,
        listName: t.list?.name
      }));
    } catch {
      return [];
    }
  }

  // Phase 78 — additive. Needed by the AI Agent's "update ClickUp task" tool (always
  // MEDIUM+ risk, always human-approved before this is ever called).
  public async updateTask(
    accessToken: string,
    taskId: string,
    payload: UpdateClickUpTaskPayload
  ): Promise<ClickUpTaskResponseDTO> {
    if (!accessToken || accessToken.startsWith('mock_')) {
      return {
        id: taskId,
        name: payload.name || 'Updated Task',
        url: `https://app.clickup.com/t/${taskId}`,
        status: { status: payload.status || 'to do' }
      };
    }

    const res = await fetch(`${this.baseUrl}/task/${taskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: accessToken
      },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        status: payload.status,
        due_date: payload.dueDate,
        priority: payload.priority
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`ClickUp API Error (${res.status}): ${errorText}`);
    }

    return res.json();
  }
}

export const clickUpClient = new ClickUpClient();
