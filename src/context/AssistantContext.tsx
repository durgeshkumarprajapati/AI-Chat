'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, useId } from 'react';
import { usePathname } from 'next/navigation';
import type { AssistantContextHint } from '@/components/assistant/assistant.types';

/**
 * Phase 89 — Step 6 of the spec: a centralized, typed page-registration mechanism so any page
 * can tell the global AI Assistant "here is what I'm looking at right now" without the assistant
 * widget needing to know about every page in the app.
 *
 * `route` and `module` are always derived automatically from `usePathname()` (see
 * `AssistantContextProvider` below) — pages never need to (and should not) register those two
 * fields themselves; they only register the id fields relevant to what they're showing
 * (`projectId`, `documentId`, etc.).
 *
 * Gap-fill decision (documented per the phase brief): the backend contract's
 * `AssistantContextHint` only carries bare ids (projectId, documentId, ...), but the drawer's
 * header needs a human-readable chip label ("📁 Project: Payment Platform", not "📁 project:
 * ck3f9..."). Rather than having the drawer do a network round-trip per id (which would need a
 * different read endpoint per entity type and would flicker on every context change), pages
 * additionally pass a UI-only `*Label` string alongside the id. These label fields are NOT part
 * of `AssistantContextHint` and are stripped before the hint is ever sent to the backend (see
 * `toContextHint` below) — they only ever drive local chip rendering. A page that omits a label
 * still works; the chip simply falls back to showing the raw id.
 */
export interface AssistantPageContext extends AssistantContextHint {
  projectLabel?: string;
  documentLabel?: string;
  knowledgeBaseLabel?: string;
  meetingLabel?: string;
  knowledgeEntityLabel?: string;
  automationLabel?: string;
}

const CONTEXT_ID_KEYS = [
  'projectId',
  'documentId',
  'knowledgeBaseId',
  'meetingId',
  'knowledgeEntityId',
  'automationId'
] as const satisfies readonly (keyof AssistantPageContext)[];

/** Strips the UI-only `*Label` fields (and `route`/`module`, which the provider owns) so the
 * object handed to `POST /api/assistant/chat` matches `AssistantContextHint` exactly. */
export function toContextHint(context: AssistantPageContext): AssistantContextHint {
  const hint: AssistantContextHint = {};
  if (context.route) hint.route = context.route;
  if (context.module) hint.module = context.module;
  if (context.projectId) hint.projectId = context.projectId;
  if (context.documentId) hint.documentId = context.documentId;
  if (context.knowledgeBaseId) hint.knowledgeBaseId = context.knowledgeBaseId;
  if (context.meetingId) hint.meetingId = context.meetingId;
  if (context.knowledgeEntityId) hint.knowledgeEntityId = context.knowledgeEntityId;
  if (context.automationId) hint.automationId = context.automationId;
  return hint;
}

interface AssistantContextInternalValue {
  context: AssistantPageContext;
  clearContext: () => void;
  clearContextKey: (_key: keyof AssistantPageContext) => void;
  registerContext: (_ownerId: string, _context: AssistantPageContext) => void;
  unregisterContext: (_ownerId: string) => void;
}

const AssistantContextInternal = createContext<AssistantContextInternalValue | undefined>(undefined);

function deriveModule(pathname: string | null): string {
  const firstSegment = (pathname ?? '').split('/').filter(Boolean)[0];
  return firstSegment || 'dashboard';
}

export function AssistantContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Registrations from every currently-mounted `useRegisterAssistantContext` caller, keyed by a
  // per-hook-instance owner id. Object key insertion order gives us "last registrant wins" for
  // overlapping fields (relevant during fast navigation where the outgoing page's effect cleanup
  // may run a tick after the incoming page's effect registers) without needing a separate stack.
  const [registrations, setRegistrations] = useState<Record<string, AssistantPageContext>>({});
  // Keys the user explicitly dismissed via a chip's "clear" affordance. Cleared again the moment
  // any registrant re-supplies that key (e.g. navigating back to a project page), so a manual
  // dismissal never permanently blinds the assistant to a field a page is actively registering.
  const [dismissedKeys, setDismissedKeys] = useState<Set<keyof AssistantPageContext>>(new Set());

  const registerContext = useCallback((ownerId: string, ctx: AssistantPageContext) => {
    setRegistrations((prev) => ({ ...prev, [ownerId]: ctx }));
    setDismissedKeys((prev) => {
      const suppliedKeys = Object.keys(ctx) as (keyof AssistantPageContext)[];
      if (!suppliedKeys.some((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      suppliedKeys.forEach((k) => next.delete(k));
      return next;
    });
  }, []);

  const unregisterContext = useCallback((ownerId: string) => {
    setRegistrations((prev) => {
      if (!(ownerId in prev)) return prev;
      const next = { ...prev };
      delete next[ownerId];
      return next;
    });
  }, []);

  const clearContext = useCallback(() => {
    setRegistrations({});
    setDismissedKeys(new Set());
  }, []);

  const clearContextKey = useCallback((key: keyof AssistantPageContext) => {
    setDismissedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const moduleName = useMemo(() => deriveModule(pathname), [pathname]);

  const context = useMemo<AssistantPageContext>(() => {
    const merged: AssistantPageContext = {};
    Object.values(registrations).forEach((registration) => {
      Object.assign(merged, registration);
    });
    dismissedKeys.forEach((key) => {
      delete merged[key];
    });
    // route/module are always the auto-derived, current-navigation values — never something a
    // page registered (pages don't need to, and shouldn't, supply these two).
    merged.route = pathname || undefined;
    merged.module = moduleName;
    return merged;
  }, [registrations, dismissedKeys, pathname, moduleName]);

  const value = useMemo<AssistantContextInternalValue>(
    () => ({ context, clearContext, clearContextKey, registerContext, unregisterContext }),
    [context, clearContext, clearContextKey, registerContext, unregisterContext]
  );

  return <AssistantContextInternal.Provider value={value}>{children}</AssistantContextInternal.Provider>;
}

/**
 * Hook a page calls to register its context, e.g.:
 *   useRegisterAssistantContext({ projectId, projectLabel: project?.name }, [projectId, project?.name]);
 *
 * Registers on mount and whenever `deps` changes; automatically clears exactly the keys it
 * registered on unmount (never another page's keys) via a stable per-instance owner id from
 * `useId()`. Safe across fast navigation: an owner id is unique to this hook call site's mounted
 * lifetime, so a remount always gets a fresh id and can never accidentally clear a different
 * mounted instance's registration.
 */
export function useRegisterAssistantContext(context: AssistantPageContext, deps: React.DependencyList = []): void {
  const internal = useContext(AssistantContextInternal);
  const ownerId = useId();
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!internal) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('useRegisterAssistantContext called outside an AssistantContextProvider — ignored.');
      }
      return;
    }
    internal.registerContext(ownerId, contextRef.current);
    return () => internal.unregisterContext(ownerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useAssistantContext(): {
  context: AssistantPageContext;
  clearContext: () => void;
  clearContextKey: (_key: keyof AssistantPageContext) => void;
} {
  const internal = useContext(AssistantContextInternal);
  if (!internal) {
    throw new Error('useAssistantContext must be used within an AssistantContextProvider');
  }
  return { context: internal.context, clearContext: internal.clearContext, clearContextKey: internal.clearContextKey };
}

export { CONTEXT_ID_KEYS };
