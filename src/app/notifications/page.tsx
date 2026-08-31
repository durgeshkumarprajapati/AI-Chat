'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NotificationPayload } from '@/features/notifications/notification.types';
import { getNotificationIcon, getNotificationDeepLink } from '@/components/notifications/notification-display';

/* -------------------------------------------------------------------------------------------- *
 * Phase 86 — full-page notification center (`/notifications`), complementing the bell dropdown
 * in `NotificationCenter.tsx`. Built against the locked contract from the phase brief:
 *   GET /api/notifications?limit=&offset=&types=A,B&unreadOnly=true&minPriority=HIGH
 *     -> { success: true, data: { notifications: NotificationPayload[], total, unreadCount } }
 * (verified against the current src/app/api/notifications/route.ts + notification.service.ts —
 * `types` / `unreadOnly` / `minPriority` are the backend's additive extension, landing in
 * parallel; the base `{notifications,total,unreadCount}` response shape already exists today).
 *
 * `priority` / `projectId` / `snapshotId` / `insightId` are Phase 86 additions to the
 * notification record that aren't declared in notification.types.ts yet — redeclared locally
 * below (per the brief) rather than editing that features file.
 * -------------------------------------------------------------------------------------------- */

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

interface NotificationRow extends NotificationPayload {
  priority?: Priority;
  projectId?: string | null;
  snapshotId?: string | null;
  insightId?: string | null;
}

type TabKey = 'all' | 'unread' | 'critical' | 'intelligence' | 'project' | 'meetings' | 'tasks';
type CategoryTab = Exclude<TabKey, 'all' | 'unread' | 'critical'>;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'critical', label: 'Critical' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'project', label: 'Project' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks' }
];

// Maps each category tab to the NotificationType values it covers, per the phase brief. Existing
// collab-chat types (MESSAGE_RECEIVED, MENTION, etc.) intentionally have no category tab — they
// still surface under "All" and "Unread".
const CATEGORY_TYPES: Record<CategoryTab, string[]> = {
  intelligence: ['DAILY_INTELLIGENCE', 'WEEKLY_INTELLIGENCE', 'KNOWLEDGE_CHANGE', 'DOCUMENT_CHANGE'],
  project: ['PROJECT_HEALTH_CHANGE', 'BLOCKER_DETECTED', 'CRITICAL_RISK'],
  meetings: ['MEETING_FOLLOW_UP'],
  tasks: ['TASK_OVERDUE', 'DEADLINE_APPROACHING', 'DEADLINE_MISSED']
};

const EMPTY_MESSAGES: Record<TabKey, string> = {
  all: 'No notifications yet.',
  unread: 'You’re all caught up — no unread notifications.',
  critical: 'No critical notifications.',
  intelligence: 'No intelligence notifications.',
  project: 'No project notifications.',
  meetings: 'No meeting notifications.',
  tasks: 'No task notifications.'
};

const PRIORITY_BADGE: Record<Priority, BadgeVariant> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  NORMAL: 'info',
  LOW: 'neutral'
};

const LIMIT = 20;

function formatRelative(ts: string | Date): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'just now';
  if (abs < 60) return `${abs}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return `${Math.abs(diffH)}h ago`;
  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffD) < 14) return `${Math.abs(diffD)}d ago`;
  return d.toLocaleDateString();
}

function buildQuery(tab: TabKey, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(LIMIT));
  params.set('offset', String(offset));
  if (tab === 'unread') params.set('unreadOnly', 'true');
  if (tab === 'critical') params.set('minPriority', 'CRITICAL');
  if (tab !== 'all' && tab !== 'unread' && tab !== 'critical') {
    params.set('types', CATEGORY_TYPES[tab].join(','));
  }
  return params.toString();
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <div className="p-4 flex items-start gap-3 animate-pulse" style={{ animationDelay: `${index * 75}ms` }}>
      <div className="w-9 h-9 rounded-lg bg-muted flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  // Guards against a slow response from a tab the user has since switched away from clobbering
  // the list for the newly-active tab.
  const requestIdRef = useRef(0);

  const load = useCallback(async (tab: TabKey, off: number, append: boolean) => {
    const myRequestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/notifications?${buildQuery(tab, off)}`);
      const json = await res.json();
      if (myRequestId !== requestIdRef.current) return;
      if (!res.ok || !json.success) {
        const message =
          typeof json?.error === 'string' ? json.error : json?.error?.message || `Failed to load notifications (${res.status}).`;
        throw new Error(message);
      }
      const page: NotificationRow[] = json.data?.notifications ?? [];
      setNotifications((prev) => (append ? [...prev, ...page] : page));
      setHasMore(page.length === LIMIT);
      setOffset(off + page.length);
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      if (myRequestId === requestIdRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setHasMore(true);
    void load(activeTab, 0, false);
  }, [activeTab, load]);

  function handleRetry() {
    void load(activeTab, 0, false);
  }

  function handleLoadMore() {
    void load(activeTab, offset, true);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      // Best-effort — the refetch below will reflect whatever the server actually persisted.
    }
    setHasMore(true);
    await load(activeTab, 0, false);
    setMarkingAll(false);
  }

  function handleActivateRow(n: NotificationRow) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    router.push(getNotificationDeepLink(n));
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🔔</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Notifications</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Everything routed to you — proactive AI intelligence, project risk and deadline alerts, and workspace activity.
          </p>
        </div>

        <Button variant="secondary" size="sm" loading={markingAll} onClick={handleMarkAllRead} disabled={notifications.length === 0}>
          Mark all read
        </Button>
      </div>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border pb-px" role="tablist" aria-label="Notification categories">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px whitespace-nowrap transition-colors duration-150 ${
              activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <Card className="p-0 divide-y divide-border overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} index={i} />
          ))}
        </Card>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="destructive" size="sm" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">🔕</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{EMPTY_MESSAGES[activeTab]}</p>
        </div>
      ) : (
        <>
          <Card className="p-0 divide-y divide-border overflow-hidden">
            {notifications.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleActivateRow(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivateRow(n);
                  }
                }}
                className={`p-4 flex items-start gap-3 cursor-pointer transition-colors duration-150 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset ${
                  !n.isRead ? 'bg-primary/5' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-muted text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  {getNotificationIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm text-foreground truncate ${!n.isRead ? 'font-bold' : 'font-semibold'}`}>{n.title}</p>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap mt-0.5">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                  {n.priority && (
                    <div className="pt-0.5">
                      <Badge variant={PRIORITY_BADGE[n.priority]}>{n.priority}</Badge>
                    </div>
                  )}
                </div>

                {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 self-center" aria-hidden="true" />}
              </div>
            ))}
          </Card>

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={handleLoadMore}>
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
