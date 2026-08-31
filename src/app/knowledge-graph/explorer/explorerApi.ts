/**
 * Phase 84 — AI Knowledge Graph Explorer.
 *
 * Thin fetch wrapper for the Explorer API surface. Every route responds `{success:true,data:T}`
 * on success or `{success:false,error:{code,message}}` on failure — but a couple of existing,
 * reused routes (`/api/projects`, `/api/knowledge-bases`) predate that convention and can return
 * a plain string under `error`, so every call site here parses defensively.
 */

import type {
  AskAboutNodeResult,
  ConnectionExplanationDTO,
  ExplorerNodeDetailDTO,
  ExplorerScope,
  GraphExplorerResponseDTO,
  KnowledgeBaseOption,
  ProjectOption
} from './explorer.types';

export type ExplorerApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string };

export type ExplorerFailureKind = 'locked' | 'disabled' | 'error';

/**
 * Disambiguates the two 403 cases this feature can hit: an entitlement gate (requireFeature —
 * show the upsell FeatureLockedModal) vs. the `KG_EXPLORER_ENABLED` config flag being off
 * (show a friendly "not enabled yet" empty state, not an upsell). Both surface as a 403 with no
 * other structural difference documented in the contract, so this classifies by message wording
 * — a deliberate, defensible judgment call rather than an ambiguity left unhandled.
 */
export function classifyExplorerFailure(res: { status: number; message: string }): ExplorerFailureKind {
  if (res.status === 403) {
    const msg = res.message.toLowerCase();
    if (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('not yet enabled')) {
      return 'disabled';
    }
    return 'locked';
  }
  return 'error';
}

function extractErrorMessage(json: unknown, fallback: string): { message: string; code?: string } {
  if (json && typeof json === 'object' && 'error' in json) {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return { message: err };
    if (err && typeof err === 'object') {
      const code = 'code' in err && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : undefined;
      const message = 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : fallback;
      return { message, code };
    }
  }
  return { message: fallback };
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<ExplorerApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, message: 'Network error — please check your connection and try again.' };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no/invalid JSON body
  }

  if (!res.ok || !json || (typeof json === 'object' && (json as { success?: boolean }).success !== true)) {
    const { message, code } = extractErrorMessage(json, `Request failed (${res.status}).`);
    return { ok: false, status: res.status, code, message };
  }

  return { ok: true, data: (json as { data: T }).data };
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface ScopeParams {
  scope: ExplorerScope;
  projectId?: string;
  knowledgeBaseId?: string;
}

/**
 * Uses POST /explorer/query rather than GET /explorer: the GET route only parses
 * scope/q/projectId/knowledgeBaseId/depth (confirmed by reading its source) — entityType/
 * relationshipType/minConfidence filters are silently ignored there. The POST route accepts the
 * full `ExplorerFilters` object and applies it server-side, BEFORE the node/edge caps are
 * enforced, so a filtered query gets a full budget of matching nodes rather than the caps being
 * spent on unfiltered results that then get trimmed client-side (which also made the
 * `truncated`/count fields inaccurate for a filtered view). The UI still applies the same filters
 * client-side as a defensive no-op belt-and-suspenders pass over whatever the server returns.
 */
export function fetchGraph(
  params: ScopeParams & { q?: string; depth?: number; entityTypes?: string[]; relationshipTypes?: string[]; minConfidence?: number }
): Promise<ExplorerApiResult<GraphExplorerResponseDTO>> {
  const hasFilters = Boolean(
    (params.entityTypes && params.entityTypes.length) ||
    (params.relationshipTypes && params.relationshipTypes.length) ||
    typeof params.minConfidence === 'number'
  );

  return request(`/api/knowledge-graph/explorer/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: params.scope,
      projectId: params.projectId,
      knowledgeBaseId: params.knowledgeBaseId,
      query: params.q,
      depth: params.depth,
      filters: hasFilters
        ? {
            entityTypes: params.entityTypes && params.entityTypes.length ? params.entityTypes : undefined,
            relationshipTypes: params.relationshipTypes && params.relationshipTypes.length ? params.relationshipTypes : undefined,
            minConfidence: params.minConfidence
          }
        : undefined
    })
  });
}

export function fetchNodeDetail(nodeId: string, params: ScopeParams): Promise<ExplorerApiResult<ExplorerNodeDetailDTO>> {
  const qs = buildQuery({ scope: params.scope, projectId: params.projectId, knowledgeBaseId: params.knowledgeBaseId });
  return request(`/api/knowledge-graph/explorer/nodes/${encodeURIComponent(nodeId)}${qs}`);
}

export function fetchNodeNeighbors(
  nodeId: string,
  params: ScopeParams & { depth?: number }
): Promise<ExplorerApiResult<GraphExplorerResponseDTO>> {
  const qs = buildQuery({
    scope: params.scope,
    projectId: params.projectId,
    knowledgeBaseId: params.knowledgeBaseId,
    depth: params.depth
  });
  return request(`/api/knowledge-graph/explorer/nodes/${encodeURIComponent(nodeId)}/neighbors${qs}`);
}

export function askAboutNode(
  nodeId: string,
  body: { question: string; scope: ExplorerScope; projectId?: string; knowledgeBaseId?: string }
): Promise<ExplorerApiResult<AskAboutNodeResult>> {
  return request(`/api/knowledge-graph/explorer/nodes/${encodeURIComponent(nodeId)}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function fetchRelationshipTypes(params: ScopeParams): Promise<ExplorerApiResult<string[]>> {
  const qs = buildQuery({ scope: params.scope, projectId: params.projectId, knowledgeBaseId: params.knowledgeBaseId });
  return request<unknown>(`/api/knowledge-graph/explorer/relationships${qs}`).then((res) => {
    if (!res.ok) return res;
    const data = res.data;
    const list = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && Array.isArray((data as { relationshipTypes?: unknown }).relationshipTypes)
        ? (data as { relationshipTypes: string[] }).relationshipTypes
        : []);
    return { ok: true, data: list as string[] };
  });
}

export function explainConnection(body: {
  sourceEntityId: string;
  targetEntityId: string;
  projectId?: string;
}): Promise<ExplorerApiResult<ConnectionExplanationDTO>> {
  return request('/api/knowledge-graph/explain-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function fetchProjects(): Promise<ExplorerApiResult<ProjectOption[]>> {
  return request<Array<{ id: string; name: string }>>('/api/projects').then((res) =>
    res.ok ? { ok: true, data: res.data.map((p) => ({ id: p.id, name: p.name })) } : res
  );
}

export function fetchKnowledgeBases(): Promise<ExplorerApiResult<KnowledgeBaseOption[]>> {
  return request<unknown>('/api/knowledge-bases').then((res) => {
    if (!res.ok) return res;
    const data = res.data as { items?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>;
    const items = Array.isArray(data) ? data : data?.items || [];
    return { ok: true, data: items.map((kb) => ({ id: kb.id, name: kb.name })) };
  });
}
