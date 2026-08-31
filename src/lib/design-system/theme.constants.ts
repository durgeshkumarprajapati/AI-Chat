/**
 * Phase 77A — reusable Tailwind class-string constants built on the centralized tokens
 * (see tokens.ts / globals.css / tailwind.config.ts). Import these instead of hand-rolling a
 * new bg/border/text combination per page — this is what makes a future
 * `<Card><Button>Save</Button></Card>` automatically theme-correct without the author thinking
 * about light/dark at all.
 *
 * These are additive: nothing existing imports this file yet, so introducing it changes no
 * current behavior. src/components/ui/* (Button, Card, Badge, Modal) consume these; pages
 * being retrofitted this phase also use them directly.
 */

export const SURFACE = {
  page: 'bg-background text-foreground',
  card: 'bg-card border border-card-border',
  cardHover: 'hover:border-primary/40 hover:shadow-md',
  sidebar: 'bg-sidebar border-sidebar-border',
  input: 'bg-input border border-input-border text-foreground placeholder:text-text-disabled',
  modalOverlay: 'bg-slate-900/60 dark:bg-black/70 backdrop-blur-md',
  modalPanel: 'bg-card border border-card-border shadow-2xl'
} as const;

export const TEXT = {
  primary: 'text-foreground',
  muted: 'text-muted-foreground',
  disabled: 'text-text-disabled',
  link: 'text-primary hover:text-primary-hover'
} as const;

export const FOCUS_RING = 'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';

export const TRANSITION = {
  base: 'transition-colors duration-150 ease-out',
  interactive: 'transition-all duration-150 ease-out',
  elevate: 'transition-shadow duration-200 ease-out'
} as const;

/** Button variants. Every variant is legible in both themes and carries hover/focus/disabled states. */
export const BUTTON_VARIANTS = {
  primary: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.interactive} bg-primary text-primary-foreground hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`,
  secondary: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.interactive} bg-muted text-foreground hover:bg-accent border border-border disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`,
  outline: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.interactive} bg-transparent text-foreground border border-border hover:border-primary hover:text-primary disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`,
  ghost: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.base} bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`,
  destructive: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.interactive} bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`,
  success: `inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${TRANSITION.interactive} bg-success text-success-foreground hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none ${FOCUS_RING}`
} as const;

export const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base'
} as const;

/** Badge/status pill variants — semantic color families that already read correctly in both themes. */
export const BADGE_VARIANTS = {
  success: 'bg-success/10 text-success border border-success/30',
  warning: 'bg-warning/10 text-warning border border-warning/30',
  destructive: 'bg-destructive/10 text-destructive border border-destructive/30',
  info: 'bg-info/10 text-info border border-info/30',
  neutral: 'bg-muted text-muted-foreground border border-border'
} as const;

export const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold';

/** Table conventions, unified across every data table in the app. */
export const TABLE = {
  wrapper: 'w-full text-left text-xs text-foreground',
  head: 'bg-muted text-muted-foreground uppercase font-mono text-[10px]',
  headCell: 'py-3 px-4',
  bodyDivide: 'divide-y divide-border',
  row: `hover:bg-accent ${TRANSITION.base}`,
  cell: 'py-3 px-4'
} as const;

/** Sidebar nav item states — the pattern AppLayout.tsx now uses, exposed for reuse/tests. */
export const SIDEBAR_NAV_ITEM = {
  base: `rounded-xl text-xs font-semibold flex items-center justify-between ${TRANSITION.interactive}`,
  active: 'bg-sidebar-active text-sidebar-active-foreground border border-primary/30 font-bold shadow-sm',
  inactive: 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-hover border border-transparent'
} as const;
