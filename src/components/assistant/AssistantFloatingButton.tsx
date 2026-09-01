'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { FOCUS_RING, TRANSITION } from '@/lib/design-system/theme.constants';

export interface AssistantFloatingButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  isStreaming: boolean;
}

const BADGE_POLL_INTERVAL_MS = 60_000;

/**
 * Phase 89 — the global floating entry point for the "AI Assistant" widget.
 *
 * Fixed bottom-right, a corner confirmed free of any other fixed-position control (the existing
 * notification bell lives in the header, not floating — see NotificationCenter.tsx). Smaller
 * offset on mobile so it doesn't crowd small screens.
 *
 * Badge sourcing (Step 22 of the spec): reuses the existing Phase 86 notification signal
 * verbatim rather than inventing a new "suggestion" system — `GET /api/notifications` filtered
 * to `unreadOnly=true&minPriority=HIGH` (both confirmed-real query params on
 * `src/app/api/notifications/route.ts`). The response's `data.total` is the count *matching that
 * filter* (unlike `data.unreadCount`, which is the unfiltered total unread count), so `total > 0`
 * is the correct "a real, actionable, high-priority signal exists" check. Polled on mount and
 * every 60s — no new backend endpoint, no fabricated suggestion detection.
 */
export function AssistantFloatingButton({ isOpen, onToggle, isStreaming }: AssistantFloatingButtonProps) {
  const [hasSignal, setHasSignal] = useState(false);

  const checkForSignal = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unreadOnly=true&minPriority=HIGH&limit=1');
      const data = await res.json();
      if (data?.success && data?.data) {
        setHasSignal((data.data.total ?? 0) > 0);
      }
    } catch {
      // Non-fatal — the badge simply stays hidden if the signal can't be fetched.
    }
  }, []);

  useEffect(() => {
    checkForSignal();
    const interval = setInterval(checkForSignal, BADGE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkForSignal]);

  // The badge reflects an outstanding real-world signal, not the open/closed state of the
  // drawer itself — once the user opens the assistant they've seen it, but we don't own marking
  // the underlying notifications read, so it's left visible until the next poll confirms it's
  // gone (e.g. the user addressed the underlying item elsewhere).
  const showBadge = hasSignal && !isOpen;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
      aria-expanded={isOpen}
      className={`fixed z-40 bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 ${TRANSITION.interactive} ${FOCUS_RING}`}
    >
      {isStreaming && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-primary-foreground/60 border-t-transparent animate-spin"
        />
      )}

      <span className="text-2xl leading-none select-none" aria-hidden="true">
        {isOpen ? '✕' : '💬'}
      </span>

      {showBadge && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive border-2 border-background flex items-center justify-center text-[9px]"
          title="You have a high-priority AI suggestion"
        >
          ✨
        </span>
      )}
    </button>
  );
}
