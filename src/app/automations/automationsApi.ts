/**
 * Phase 88 Part A — AI Workflow Automation UI.
 *
 * Thin fetch wrapper for the `/api/automations/**` surface. Every route responds
 * `{success:true,data:T}` on success or `{success:false,error:{code,message}}` on failure —
 * mirrors the defensive-parse pattern in `src/app/knowledge-graph/explorer/explorerApi.ts`.
 *
 * The exact routes/shapes here were verified against the Phase 88 spec's locked contract. The
 * sibling backend agent's route files had not landed under `src/app/api/automations/**` at the
 * time this file was written (checked via `find` before writing) — if a real deviation is found
 * later, adapt call sites here rather than the contract types in `automation.types.ts`.
 */

import type {
  AutomationDefinitionDTO,
  AutomationDetailDTO,
  AutomationExecutionDetailDTO,
  AutomationExecutionSummaryDTO,
  AutomationStatus,
  AutomationSummaryDTO,
  AutomationTriggerBindingDTO,
  AutomationTriggerType
} from './automation.types';

export type AutomationApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string; fieldErrors?: Record<string, string[]> };

function extractError(json: unknown, fallback: string): { message: string; code?: string; fieldErrors?: Record<string, string[]> } {
  if (json && typeof json === 'object' && 'error' in json) {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return { message: err };
    if (err && typeof err === 'object') {
      const e = err as { code?: unknown; message?: unknown; fieldErrors?: unknown; details?: unknown };
      const code = typeof e.code === 'string' ? e.code : undefined;
      const message = typeof e.message === 'string' ? e.message : fallback;
      // Server-side validation errors may identify the offending node via a `nodeKey` — surfaced
      // defensively under a few plausible shapes since the exact 400 payload shape for
      // POST /versions isn't pinned down verbatim in the contract beyond "may 400 with validation
      // errors ... if the error payload identifies a nodeKey".
      const rawFieldErrors = e.fieldErrors ?? e.details;
      let fieldErrors: Record<string, string[]> | undefined;
      if (rawFieldErrors && typeof rawFieldErrors === 'object' && !Array.isArray(rawFieldErrors)) {
        fieldErrors = {};
        for (const [key, value] of Object.entries(rawFieldErrors as Record<string, unknown>)) {
          fieldErrors[key] = Array.isArray(value) ? value.map(String) : [String(value)];
        }
      } else if (Array.isArray(rawFieldErrors)) {
        fieldErrors = {};
        for (const item of rawFieldErrors as unknown[]) {
          if (item && typeof item === 'object' && 'nodeKey' in item) {
            const nodeKey = String((item as { nodeKey: unknown }).nodeKey);
            const msg = 'message' in item ? String((item as { message: unknown }).message) : 'Invalid configuration';
            fieldErrors[nodeKey] = [...(fieldErrors[nodeKey] || []), msg];
          }
        }
      }
      return { message, code, fieldErrors };
    }
  }
  return { message: fallback };
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<AutomationApiResult<T>> {
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
    const { message, code, fieldErrors } = extractError(json, `Request failed (${res.status}).`);
    return { ok: false, status: res.status, code, message, fieldErrors };
  }

  return { ok: true, data: (json as { data: T }).data };
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

export function fetchAutomations(): Promise<AutomationApiResult<AutomationSummaryDTO[]>> {
  return request('/api/automations');
}

export function createAutomation(body: {
  name: string;
  description?: string;
  projectId?: string;
  definition: AutomationDefinitionDTO;
}): Promise<AutomationApiResult<AutomationDetailDTO>> {
  return request('/api/automations', jsonInit('POST', body));
}

export function fetchAutomation(id: string): Promise<AutomationApiResult<AutomationDetailDTO>> {
  return request(`/api/automations/${encodeURIComponent(id)}`);
}

export function updateAutomation(
  id: string,
  body: { name?: string; description?: string; status?: AutomationStatus }
): Promise<AutomationApiResult<AutomationDetailDTO>> {
  return request(`/api/automations/${encodeURIComponent(id)}`, jsonInit('PATCH', body));
}

export function archiveAutomation(id: string): Promise<AutomationApiResult<unknown>> {
  return request(`/api/automations/${encodeURIComponent(id)}`, jsonInit('DELETE'));
}

export function publishVersion(
  id: string,
  definition: AutomationDefinitionDTO
): Promise<AutomationApiResult<{ id: string; versionNumber: number; createdAt: string }>> {
  return request(`/api/automations/${encodeURIComponent(id)}/versions`, jsonInit('POST', { definition }));
}

/**
 * GAP: `AutomationDetailDTO.versions` only carries `{id, versionNumber, createdAt,
 * createdByUserId}` — no `definition` — so viewing a past version's graph read-only (required by
 * the spec's "Version history ... clicking one loads it READ-ONLY into the canvas") needs a route
 * the locked contract doesn't document. This speculatively calls the one shape that's consistent
 * with the rest of the `/api/automations/[id]/versions` surface; every call site treats a failure
 * here as "not available" (graceful empty state), never a hard error, since this endpoint's
 * existence isn't guaranteed by the contract.
 */
export function fetchVersionDetail(
  id: string,
  versionId: string
): Promise<AutomationApiResult<{ id: string; versionNumber: number; definition: AutomationDefinitionDTO; createdAt: string }>> {
  return request(`/api/automations/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`);
}

export function fetchExecutions(
  id: string,
  params: { limit: number; offset: number }
): Promise<AutomationApiResult<{ executions: AutomationExecutionSummaryDTO[]; total: number }>> {
  const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) }).toString();
  return request(`/api/automations/${encodeURIComponent(id)}/executions?${qs}`);
}

export function fetchExecutionDetail(id: string, executionId: string): Promise<AutomationApiResult<AutomationExecutionDetailDTO>> {
  return request(`/api/automations/${encodeURIComponent(id)}/executions/${encodeURIComponent(executionId)}`);
}

export function createTriggerBinding(
  id: string,
  body: { triggerType: AutomationTriggerType; filterJson?: Record<string, unknown> }
): Promise<AutomationApiResult<AutomationTriggerBindingDTO>> {
  return request(`/api/automations/${encodeURIComponent(id)}/trigger-bindings`, jsonInit('POST', body));
}

export function deleteTriggerBinding(id: string, bindingId: string): Promise<AutomationApiResult<unknown>> {
  return request(`/api/automations/${encodeURIComponent(id)}/trigger-bindings/${encodeURIComponent(bindingId)}`, jsonInit('DELETE'));
}

/**
 * Enable/disable an existing binding. GAP: the contract's `AutomationTriggerBindingDTO` carries
 * an `enabled` flag (implying the backend models a binding that exists-but-is-disabled), but the
 * two documented trigger-binding routes are only POST (create) and DELETE (remove) — there is no
 * PATCH route to flip `enabled` on an existing binding in place. Modeled here the only way the
 * documented routes allow: turning a binding OFF deletes it; turning it back ON re-creates it
 * (new `id`, same `triggerType`/`filterJson`). This is a real, noted UX limitation — see the
 * phase report — not a guess at an undocumented endpoint.
 */
export async function setTriggerBindingEnabled(
  id: string,
  binding: AutomationTriggerBindingDTO,
  enabled: boolean
): Promise<AutomationApiResult<AutomationTriggerBindingDTO | { deleted: true }>> {
  if (!enabled) {
    const del = await deleteTriggerBinding(id, binding.id);
    return del.ok ? { ok: true, data: { deleted: true } } : del;
  }
  return createTriggerBinding(id, {
    triggerType: binding.triggerType,
    filterJson: binding.filterJson || undefined
  });
}
