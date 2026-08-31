/**
 * Phase 77A centralized design tokens — TypeScript surface.
 *
 * The actual color values live in ONE place: `src/app/globals.css`'s `:root/.dark` and
 * `.light` blocks, mapped to Tailwind utilities in `tailwind.config.ts`. This file does not
 * duplicate those values — it exports the *names* so JS/TS code (status maps, chart colors,
 * inline-style edge cases where a Tailwind class can't reach) references the same semantic
 * tokens instead of a fresh hardcoded hex literal, and resolves them via `getToken()`, which
 * reads the live CSS variable so both themes stay correct automatically.
 */

export const DESIGN_TOKENS = {
  background: '--background',
  foreground: '--foreground',
  surface: '--surface',
  surfaceHover: '--surface-hover',
  border: '--border',
  cardBorder: '--card-border',
  textMuted: '--text-muted',
  textDisabled: '--text-disabled',
  card: '--card-bg',

  primary: '--primary',
  primaryHover: '--primary-hover',
  primaryForeground: '--primary-foreground',
  ring: '--ring',
  accent: '--accent',
  accentForeground: '--accent-foreground',

  success: '--success',
  successForeground: '--success-foreground',
  warning: '--warning',
  warningForeground: '--warning-foreground',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  info: '--info',
  infoForeground: '--info-foreground',

  muted: '--muted',
  mutedForeground: '--muted-foreground',

  sidebarBg: '--sidebar-bg',
  sidebarForeground: '--sidebar-foreground',
  sidebarHover: '--sidebar-hover-bg',
  sidebarActive: '--sidebar-active-bg',
  sidebarActiveForeground: '--sidebar-active-foreground',
  sidebarBorder: '--sidebar-border',

  inputBg: '--input-bg',
  inputBorder: '--input-border'
} as const;

export type DesignTokenName = keyof typeof DESIGN_TOKENS;

/**
 * Reads a token's current resolved value from the live DOM (respects whichever theme is
 * currently applied). Returns an empty string during SSR / before mount — callers that need a
 * value before paint should use the Tailwind class form (e.g. `bg-primary`) instead, which
 * resolves via CSS and needs no JS at all.
 */
export function getToken(name: DesignTokenName): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(DESIGN_TOKENS[name]).trim();
}

/** Semantic status → token name, for places that need a raw color value (inline style, charts, canvas) rather than a Tailwind class. */
export const SEMANTIC_STATUS_TOKENS = {
  success: 'success',
  active: 'success',
  warning: 'warning',
  pastDue: 'warning',
  gracePeriod: 'warning',
  cancelScheduled: 'warning',
  error: 'destructive',
  suspended: 'destructive',
  info: 'info',
  trialing: 'info',
  neutral: 'mutedForeground',
  canceled: 'mutedForeground',
  expired: 'mutedForeground',
  incomplete: 'mutedForeground'
} as const satisfies Record<string, DesignTokenName>;
