// Small, dependency-free helpers for the aggregation service. Deliberately does NOT import from
// src/features/project-intelligence/ (even though its project-intelligence.util.ts has an
// equivalent helper) so this module's import graph stays minimal and independently auditable —
// see worker/tsconfig.json's NodeNext trap notes for why keeping ai-intelligence's own import
// surface small and self-contained matters.

/** MeetingAnalysis Json fields (decisions/actionItems/risks/blockers) are stored as arrays but
 *  the element shape has never been enforced — defensively normalize to an array of strings. */
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
