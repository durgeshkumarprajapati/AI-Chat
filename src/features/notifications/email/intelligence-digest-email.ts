// Phase 86 — builds the transactional email for a daily/weekly AI Workspace Intelligence digest.
//
// SECURITY NOTE (spec section 34): notifications may contain AI-generated content. `summary` and
// any string pulled out of `structuredData` are treated as UNTRUSTED plain text — never rendered
// as raw HTML. Every interpolated dynamic string below goes through escapeHtml() first.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SnapshotLike {
  summary: string | null;
  structuredData: unknown;
}

function truncate(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Pulls up to `limit` short title-like strings out of a bounded array field of `structuredData`,
 * tolerating any shape (Phase 85's AggregatedSignals SignalRef[] or otherwise) since this
 * consumes already-persisted JSON, not a typed object. */
function extractTopItems(structuredData: unknown, key: string, limit: number): string[] {
  if (!structuredData || typeof structuredData !== 'object') return [];
  const value = (structuredData as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map((item) => {
      if (item && typeof item === 'object' && 'title' in item && typeof (item as { title?: unknown }).title === 'string') {
        return (item as { title: string }).title;
      }
      return typeof item === 'string' ? item : null;
    })
    .filter((v): v is string => Boolean(v));
}

export function buildDigestEmail(
  snapshot: SnapshotLike,
  type: 'DAILY' | 'WEEKLY',
  appBaseUrl: string
): { subject: string; html: string; text: string } {
  const subject = type === 'DAILY' ? 'Your AI Workspace Intelligence — Today' : 'Your Weekly AI Workspace Intelligence';
  const deepLink = `${appBaseUrl.replace(/\/$/, '')}/intelligence`;

  const risks = extractTopItems(snapshot.structuredData, 'risks', 3);
  const overdueTasks = extractTopItems(snapshot.structuredData, 'overdueTasks', 3);
  const deadlineRisks = extractTopItems(snapshot.structuredData, 'deadlineRisks', 3);
  const meetings = extractTopItems(snapshot.structuredData, 'recentMeetings', 3);

  const summaryText = snapshot.summary ? truncate(snapshot.summary, 500) : 'Your workspace intelligence briefing is ready.';

  const section = (title: string, items: string[]) =>
    items.length
      ? `<tr><td style="padding:12px 0 4px;font-weight:600;color:#1f2937;">${escapeHtml(title)}</td></tr>` +
        items.map((item) => `<tr><td style="padding:2px 0;color:#374151;">• ${escapeHtml(truncate(item, 200))}</td></tr>`).join('')
      : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:24px 24px 8px;">
        <h1 style="font-size:18px;margin:0 0 8px;color:#111827;">${escapeHtml(subject)}</h1>
        <p style="color:#374151;font-size:14px;line-height:1.5;margin:0 0 12px;">${escapeHtml(summaryText)}</p>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
          ${section('Critical risks', risks)}
          ${section('Overdue tasks', overdueTasks)}
          ${section('Upcoming deadlines', deadlineRisks)}
          ${section('Recent meetings', meetings)}
        </table>
      </td></tr>
      <tr><td style="padding:20px 24px 24px;">
        <a href="${escapeHtml(deepLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;">Open Intelligence</a>
      </td></tr>
    </table>
  </body>
</html>`;

  const textLines = [
    subject,
    '',
    summaryText,
    '',
    ...(risks.length ? ['Critical risks:', ...risks.map((r) => `- ${r}`), ''] : []),
    ...(overdueTasks.length ? ['Overdue tasks:', ...overdueTasks.map((r) => `- ${r}`), ''] : []),
    ...(deadlineRisks.length ? ['Upcoming deadlines:', ...deadlineRisks.map((r) => `- ${r}`), ''] : []),
    ...(meetings.length ? ['Recent meetings:', ...meetings.map((r) => `- ${r}`), ''] : []),
    `[Open Intelligence] ${deepLink}`
  ];

  return { subject, html, text: textLines.join('\n') };
}
