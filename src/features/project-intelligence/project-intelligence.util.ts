// Phase 78B — small shared helpers used across the project-intelligence detectors. Kept in one
// place instead of duplicated per-service. Nothing here talks to prisma directly.

/**
 * Runs `fn` and races it against a timer. This is a *soft* timeout: it does not (and cannot,
 * without cooperative cancellation) abort the underlying work — it just stops waiting and
 * returns `fallback` so a slow analysis pass never hangs a caller beyond the configured
 * INTELLIGENCE_ANALYSIS_TIMEOUT_MS budget.
 */
export async function withSoftTimeout<T>(fn: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), Math.max(1, timeoutMs));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Meeting analysis Json fields (risks/discussion/openQuestions) are stored as arrays but the
 *  element shape has never been enforced — defensively normalize to an array of strings. */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const text = obj.text ?? obj.description ?? obj.title ?? obj.summary;
        if (typeof text === 'string') return text;
        try {
          return JSON.stringify(item);
        } catch {
          return '';
        }
      }
      return item == null ? '' : String(item);
    })
    .filter((s) => s.trim().length > 0);
}

/** Stable, cheap normalization used as a dedupe key fragment — not a cryptographic hash, just
 *  enough to avoid re-creating an insight for the exact same text on a second run. */
export function normalizeForDedupe(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

// ClickUp task status strings are free-form on their side; this is a small heuristic list of
// "done-like" statuses used only to decide whether an overdue due-date still counts as a live
// blocker signal, not an attempt to model their full workflow.
const DONE_LIKE_CLICKUP_STATUSES = ['complete', 'completed', 'done', 'closed', 'resolved', 'cancelled', 'canceled'];

export function isDoneLikeClickUpStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const lower = status.toLowerCase();
  return DONE_LIKE_CLICKUP_STATUSES.some((s) => lower.includes(s));
}

// Fixed keyword list for PROBABLE blocker detection — a heuristic over meeting text, explicitly
// not a claim of language understanding. Documented here so the signal is auditable.
export const PROBABLE_BLOCKER_KEYWORDS = [
  'waiting on',
  'blocked by',
  'pending approval',
  'dependency',
  'dependent on',
  'on hold',
  'stuck on',
  'awaiting'
];

export function findProbableBlockerKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of PROBABLE_BLOCKER_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// Keyword-based severity for risk items extracted from MeetingAnalysis.risks. A heuristic, not
// an AI judgement — documented so severity is always explainable from the text itself.
export function deriveRiskSeverity(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const lower = text.toLowerCase();
  if (/(critical|severe|urgent)/.test(lower)) return 'CRITICAL';
  if (/(block|blocker|blocked)/.test(lower)) return 'HIGH';
  if (/(delay|risk|concern)/.test(lower)) return 'MEDIUM';
  return 'LOW';
}
