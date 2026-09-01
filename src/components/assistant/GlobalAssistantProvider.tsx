'use client';

import React, { useState, useCallback } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { AssistantContextProvider } from '@/context/AssistantContext';
import { AssistantFloatingButton } from './AssistantFloatingButton';
import { AssistantDrawer } from './AssistantDrawer';

/**
 * Phase 89 — mounted ONCE at the application root (see `src/components/layout/AppLayout.tsx`)
 * inside the authenticated-shell branch only, so the "AI Assistant" floating button + drawer
 * appear on every authenticated page.
 *
 * Composition decision: this wraps `AssistantContextProvider` (the page-registration mechanism
 * from `src/context/AssistantContext.tsx`) around `children` — not just around the widget UI —
 * so that any page rendered under it can call `useRegisterAssistantContext(...)` and have it
 * reach the drawer. The two concerns (context registration vs. floating UI) are kept as separate
 * modules for testability/reuse, but composed together here as a single mount point so
 * `AppLayout.tsx` only needs to add one wrapping component.
 */
export function GlobalAssistantProvider({ children }: { children: React.ReactNode }) {
  return (
    <AssistantContextProvider>
      {children}
      <AssistantWidget />
    </AssistantContextProvider>
  );
}

function AssistantWidget() {
  const { authStatus } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleToggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  // Gate on real auth status (not just the pathname whitelist AppLayout already has) — this is
  // the "smaller, more surgical" check called out in the phase brief: it correctly excludes
  // public-but-not-marketing-whitelisted pages (e.g. /pricing, /contact-us) without touching
  // AppLayout's existing `isMarketingOrStandalone` array.
  if (authStatus !== 'AUTHENTICATED') return null;

  return (
    <>
      <AssistantFloatingButton isOpen={isOpen} onToggle={handleToggle} isStreaming={isStreaming} />
      <AssistantDrawer isOpen={isOpen} onClose={handleClose} onStreamingChange={setIsStreaming} />
    </>
  );
}
