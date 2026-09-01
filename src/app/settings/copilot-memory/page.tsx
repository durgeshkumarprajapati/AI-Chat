'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Badge, Button, Modal, type BadgeVariant } from '@/components/ui';
import { SURFACE, TEXT, FOCUS_RING, TRANSITION } from '@/lib/design-system/theme.constants';

// ---------------------------------------------------------------------------
// Types (mirrors the backend contract in the Phase 90 spec — see
// src/app/api/copilot/memory/**). Kept local to this page since it is UI-only.
// ---------------------------------------------------------------------------

type CopilotMemoryCategory =
  | 'USER_PREFERENCE'
  | 'LEARNING_PREFERENCE'
  | 'PROJECT_CONTEXT'
  | 'GOAL'
  | 'TECHNICAL_CONTEXT'
  | 'WORKFLOW_PREFERENCE'
  | 'USER_PROFILE'
  | 'TECHNICAL_DECISION'
  | 'IMPORTANT_FACT'
  | 'CONVERSATION_MEMORY'
  | 'WORKING_PATTERN';

interface MemoryDTO {
  id: string;
  category: CopilotMemoryCategory | string;
  key: string;
  value: string;
  confidence: number;
  importance: number | null;
  source: string;
  sourceType: string | null;
  sourceId: string | null;
  projectId: string | null;
  lastUsedAt: string | null;
  accessCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemorySettingsDTO {
  memoryEnabled: boolean;
  autoLearnEnabled: boolean;
  projectMemoryEnabled: boolean;
  conversationMemoryEnabled: boolean;
}

type ClearScope = 'CONVERSATION' | 'PROJECT' | 'ALL';

interface ProjectOption {
  id: string;
  name: string;
}

type ImportanceBucket = 'all' | 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<CopilotMemoryCategory, string> = {
  USER_PREFERENCE: 'User Preference',
  LEARNING_PREFERENCE: 'Learning Preference',
  PROJECT_CONTEXT: 'Project Context',
  GOAL: 'Goal',
  TECHNICAL_CONTEXT: 'Technical Context',
  WORKFLOW_PREFERENCE: 'Workflow Preference',
  USER_PROFILE: 'User Profile',
  TECHNICAL_DECISION: 'Technical Decision',
  IMPORTANT_FACT: 'Important Fact',
  CONVERSATION_MEMORY: 'Conversation Memory',
  WORKING_PATTERN: 'Working Pattern'
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CopilotMemoryCategory[];

/**
 * Category -> Badge variant grouping. There are 11 categories but only 5 shared
 * Badge variants (success/warning/destructive/info/neutral), so this is a semantic
 * grouping rather than a 1:1 mapping:
 *  - info:    stable personal/system preferences (low-risk, "how the user likes things")
 *  - success: confirmed factual/contextual grounding (project + technical context, facts)
 *  - warning: judgment calls worth a second look (decisions, goals — things that can change)
 *  - neutral: ambient, system-derived signals (conversation memory, working patterns)
 *  - destructive: intentionally unused — no memory category is inherently alarming.
 */
const CATEGORY_BADGE_VARIANT: Record<CopilotMemoryCategory, BadgeVariant> = {
  USER_PREFERENCE: 'info',
  LEARNING_PREFERENCE: 'info',
  WORKFLOW_PREFERENCE: 'info',
  USER_PROFILE: 'info',
  PROJECT_CONTEXT: 'success',
  TECHNICAL_CONTEXT: 'success',
  IMPORTANT_FACT: 'success',
  GOAL: 'warning',
  TECHNICAL_DECISION: 'warning',
  CONVERSATION_MEMORY: 'neutral',
  WORKING_PATTERN: 'neutral'
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as CopilotMemoryCategory] ?? category;
}

function categoryBadgeVariant(category: string): BadgeVariant {
  return CATEGORY_BADGE_VARIANT[category as CopilotMemoryCategory] ?? 'neutral';
}

const SETTINGS_FIELDS: { key: keyof MemorySettingsDTO; label: string; help: string }[] = [
  { key: 'memoryEnabled', label: 'Memory', help: 'Master switch — when off, no new memories are learned or retrieved.' },
  { key: 'autoLearnEnabled', label: 'Auto-learn', help: 'Automatically capture preferences and facts from your conversations.' },
  { key: 'projectMemoryEnabled', label: 'Project memory', help: 'Remember context scoped to individual projects.' },
  { key: 'conversationMemoryEnabled', label: 'Conversation memory', help: 'Remember context carried between chat sessions.' }
];

const DEFAULT_SETTINGS: MemorySettingsDTO = {
  memoryEnabled: true,
  autoLearnEnabled: true,
  projectMemoryEnabled: true,
  conversationMemoryEnabled: true
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Handles both the legacy `{success:false, error:"string"}` and the newer `{success:false, error:{code,message}}` envelopes. */
function extractErrorMessage(payload: any, fallback: string): string {
  const e = payload?.error;
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && typeof e.message === 'string') return e.message;
  return fallback;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never used';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never used';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.round(diffMonth / 12);
  return `${diffYear}y ago`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function importanceBucketOf(importance: number | null): Exclude<ImportanceBucket, 'all'> {
  const v = importance ?? 0;
  if (v >= 0.7) return 'high';
  if (v >= 0.4) return 'medium';
  return 'low';
}

function ImportanceDots({ importance }: { importance: number | null }) {
  if (importance === null) {
    return <span className={`text-[10px] font-mono ${TEXT.disabled}`}>—</span>;
  }
  const filled = Math.max(1, Math.min(5, Math.round(importance * 5)));
  return (
    <span className="inline-flex items-center gap-0.5" title={`Importance: ${importance.toFixed(2)}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < filled ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </span>
  );
}

const CLEAR_SCOPE_COPY: Record<ClearScope, { title: string; body: (_projectName?: string) => string }> = {
  CONVERSATION: {
    title: 'Clear conversation memories?',
    body: () => 'This permanently deletes memories captured from chat/conversation context across all your projects. This cannot be undone.'
  },
  PROJECT: {
    title: 'Clear project memories?',
    body: (projectName) =>
      `This permanently deletes all memories scoped to "${projectName ?? 'the selected project'}". Memories from other projects are not affected. This cannot be undone.`
  },
  ALL: {
    title: 'Clear all memories?',
    body: () => 'This permanently deletes every memory Copilot has stored about you — preferences, facts, project context, everything. This cannot be undone.'
  }
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CopilotMemorySettingsPage() {
  // Data
  const [memories, setMemories] = useState<MemoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [settings, setSettings] = useState<MemorySettingsDTO>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<keyof MemorySettingsDTO | null>(null);
  const [savedField, setSavedField] = useState<keyof MemorySettingsDTO | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CopilotMemoryCategory | ''>('');
  const [projectId, setProjectId] = useState<string>('');
  const [importanceBucket, setImportanceBucket] = useState<ImportanceBucket>('all');

  // Row editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editImportance, setEditImportance] = useState<number>(0.5);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Privacy actions
  const [confirmScope, setConfirmScope] = useState<ClearScope | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const hasFetchedOnce = useRef(false);

  // Debounce search input -> search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchMemories = useCallback(async () => {
    setLoading(!hasFetchedOnce.current);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (projectId) params.set('projectId', projectId);
      if (importanceBucket === 'high') params.set('minImportance', '0.7');
      else if (importanceBucket === 'medium') params.set('minImportance', '0.4');

      const qs = params.toString();
      const res = await fetch(`/api/copilot/memory${qs ? `?${qs}` : ''}`);
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(extractErrorMessage(data, 'Failed to load memories'));
      }
      setMemories(Array.isArray(data.data) ? data.data : []);
      hasFetchedOnce.current = true;
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [search, category, projectId, importanceBucket]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/copilot/memory/settings');
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(extractErrorMessage(data, 'Settings unavailable'));
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      setSettingsError(null);
    } catch (err: any) {
      // Non-fatal: the settings endpoint may not be deployed yet. Keep sensible
      // defaults and surface a small inline notice rather than blocking the page.
      setSettingsError(err?.message || 'Memory settings are unavailable right now');
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await safeJson(res);
      if (res.ok && data?.success && Array.isArray(data.data)) {
        setProjects(data.data.map((p: any) => ({ id: p.id, name: p.name })));
      }
    } catch {
      // Non-fatal — project filter / project-name chips just fall back to raw ids.
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchProjects();
  }, [fetchSettings, fetchProjects]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const filtersActive = Boolean(search || category || projectId || importanceBucket !== 'all');

  // Client-side safety net: apply the same filters locally so the page behaves
  // correctly even before the backend's query-param filtering ships / for any
  // filter it doesn't yet support.
  const visibleMemories = useMemo(() => {
    return memories.filter((m) => {
      if (category && m.category !== category) return false;
      if (projectId && m.projectId !== projectId) return false;
      if (importanceBucket !== 'all' && importanceBucketOf(m.importance) !== importanceBucket) return false;
      if (search) {
        const needle = search.toLowerCase();
        if (!m.value.toLowerCase().includes(needle) && !m.key.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [memories, category, projectId, importanceBucket, search]);

  // ---- settings toggles ----

  async function toggleSetting(field: keyof MemorySettingsDTO) {
    const prev = settings;
    const next = { ...settings, [field]: !settings[field] };
    setSettings(next);
    setSavingField(field);
    setSavedField(null);
    try {
      const res = await fetch('/api/copilot/memory/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next[field] })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(extractErrorMessage(data, 'Failed to save setting'));
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.data });
      setSettingsError(null);
      setSavedField(field);
      setTimeout(() => setSavedField((f) => (f === field ? null : f)), 1500);
    } catch (err: any) {
      setSettings(prev); // rollback
      setSettingsError(err?.message || 'Failed to save setting');
    } finally {
      setSavingField((f) => (f === field ? null : f));
    }
  }

  // ---- row actions ----

  async function handleDeleteMemory(id: string) {
    // "Forget" (spec wording) and "Delete" are the same operation against the
    // same DELETE /api/copilot/memory/[id] endpoint — see report for rationale.
    const prev = memories;
    setMemories((cur) => cur.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/copilot/memory/${id}`, { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(extractErrorMessage(data, 'Failed to delete memory'));
      }
    } catch (err: any) {
      setMemories(prev); // rollback
      setLoadError(err?.message || 'Failed to delete memory');
    }
  }

  function startEdit(m: MemoryDTO) {
    setEditingId(m.id);
    setEditValue(m.value);
    setEditImportance(m.importance ?? 0.5);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!editValue.trim()) {
      setEditError('Value cannot be empty');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/copilot/memory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue.trim(), importance: editImportance })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        throw new Error(extractErrorMessage(data, 'Failed to save changes'));
      }
      const updated: MemoryDTO = data.data;
      setMemories((cur) => cur.map((m) => (m.id === id ? { ...m, ...updated } : m)));
      setEditingId(null);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  // ---- privacy actions ----

  async function performClear(scope: ClearScope) {
    setClearing(true);
    setClearError(null);
    try {
      const res = await fetch('/api/copilot/memory/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope === 'PROJECT' ? { scope, projectId } : { scope })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) {
        // Fallback for 'ALL' only: the pre-existing DELETE /api/copilot/memory
        // endpoint already performs a full clear and is known-good today, so if
        // the new unified /clear endpoint isn't deployed yet we degrade to it
        // rather than leaving the button non-functional.
        if (scope === 'ALL' && (res.status === 404 || res.status === 405)) {
          const fallbackRes = await fetch('/api/copilot/memory', { method: 'DELETE' });
          const fallbackData = await safeJson(fallbackRes);
          if (!fallbackRes.ok || !fallbackData?.success) {
            throw new Error(extractErrorMessage(fallbackData, 'Failed to clear memories'));
          }
        } else {
          throw new Error(extractErrorMessage(data, 'Failed to clear memories'));
        }
      }
      setConfirmScope(null);
      await fetchMemories();
    } catch (err: any) {
      setClearError(err?.message || 'Failed to clear memories');
    } finally {
      setClearing(false);
    }
  }

  const selectedProjectName = projectId ? projectNameById.get(projectId) ?? projectId : undefined;
  const memoryDisabled = settingsLoaded && settings.memoryEnabled === false;

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header / Overview */}
      <Card>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">💾</span>
              <div>
                <h1 className={`text-xl font-bold ${TEXT.primary}`}>Copilot Memory</h1>
                <p className={`text-xs ${TEXT.muted} mt-0.5`}>
                  Transparent, user-controlled memory. Review, edit, or forget anything Copilot has learned about you.
                </p>
              </div>
            </div>
            <a
              href="/api/copilot/memory/export"
              download
              className={`text-xs font-semibold underline underline-offset-2 ${TEXT.link}`}
            >
              Export My Data
            </a>
          </div>

          {settingsError && (
            <div className="text-[11px] px-3 py-2 rounded-lg bg-warning/10 text-warning border border-warning/30">
              {settingsError} — showing default settings; toggles below will retry on next change.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SETTINGS_FIELDS.map(({ key, label, help }) => (
              <div key={key} className={`rounded-xl p-3 ${SURFACE.card} border`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${TEXT.primary}`}>{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings[key]}
                    onClick={() => toggleSetting(key)}
                    disabled={savingField === key}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full ${TRANSITION.base} ${FOCUS_RING} ${
                      settings[key] ? 'bg-primary' : 'bg-muted border border-border'
                    } disabled:opacity-60`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ${TRANSITION.base} ${
                        settings[key] ? 'translate-x-[18px]' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className={`text-[10px] ${TEXT.muted} mt-1.5 leading-snug`}>{help}</p>
                <div className="h-3 mt-1">
                  {savingField === key && <span className="text-[10px] text-muted-foreground">Saving…</span>}
                  {savedField === key && savingField !== key && <span className="text-[10px] text-success">Saved</span>}
                </div>
              </div>
            ))}
          </div>

          <div className={`text-[11px] ${TEXT.muted}`}>
            Showing <span className="font-semibold text-foreground">{visibleMemories.length}</span>{' '}
            {visibleMemories.length === 1 ? 'memory' : 'memories'}
            {filtersActive ? ' matching current filters' : ''}.
          </div>
        </div>
      </Card>

      {memoryDisabled && (
        <div className="text-xs px-4 py-3 rounded-xl bg-warning/10 text-warning border border-warning/30">
          Memory is currently <strong>disabled</strong> — Copilot won&apos;t learn new memories or use existing ones in
          conversations. Memories already stored below are still visible and can be reviewed, edited, or forgotten.
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search memories…"
            className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CopilotMemoryCategory | '')}
            className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
          >
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={importanceBucket}
            onChange={(e) => setImportanceBucket(e.target.value as ImportanceBucket)}
            className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
          >
            <option value="all">Any importance</option>
            <option value="high">High importance</option>
            <option value="medium">Medium importance</option>
            <option value="low">Low importance</option>
          </select>
        </div>
      </Card>

      {/* Privacy actions */}
      <Card>
        <div className="flex flex-col gap-3">
          <h2 className={`text-sm font-semibold ${TEXT.primary}`}>Privacy Actions</h2>
          {clearError && (
            <div className="text-[11px] px-3 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30">
              {clearError}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmScope('CONVERSATION')}>
              Clear Conversation Memories
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!projectId}
              title={projectId ? undefined : 'Select a project in the filters above first'}
              onClick={() => setConfirmScope('PROJECT')}
            >
              Clear Project Memories
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmScope('ALL')}>
              Clear All Memories
            </Button>
          </div>
        </div>
      </Card>

      {/* Memory list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-20 rounded-xl ${SURFACE.card} border animate-pulse`} />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <div className="text-center py-8 space-y-3">
            <p className="text-sm font-semibold text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchMemories()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : visibleMemories.length === 0 ? (
        <Card>
          <div className="p-6 text-center space-y-3">
            <span className="text-4xl">🧠</span>
            {memories.length === 0 ? (
              <>
                <p className={`text-sm font-semibold ${TEXT.primary}`}>No Remembered Items</p>
                <p className={`text-xs ${TEXT.muted} max-w-md mx-auto`}>
                  When you run Copilot sessions or save preferences, your explicit project context and goals will be
                  listed here.
                </p>
              </>
            ) : (
              <>
                <p className={`text-sm font-semibold ${TEXT.primary}`}>No memories match your filters</p>
                <p className={`text-xs ${TEXT.muted} max-w-md mx-auto`}>
                  Try clearing the search, category, project, or importance filters above.
                </p>
              </>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleMemories.map((m) => {
            const isEditing = editingId === m.id;
            const isExpanded = expandedId === m.id;
            const isLong = m.value.length > 220;
            const showConfidence = typeof m.confidence === 'number' && m.confidence < 0.95;
            const projectName = m.projectId ? projectNameById.get(m.projectId) ?? m.projectId.slice(0, 8) : null;

            return (
              <Card key={m.id} className="!p-4">
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={categoryBadgeVariant(m.category)}>{categoryLabel(m.category)}</Badge>
                    <span className={`font-bold ${TEXT.primary}`}>{m.key}</span>
                    {projectName && <Badge variant="neutral">{projectName}</Badge>}
                    {showConfidence && (
                      <span className={`text-[10px] font-mono ${TEXT.muted}`}>
                        {Math.round(m.confidence * 100)}% confidence
                      </span>
                    )}
                    <ImportanceDots importance={m.importance} />
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={3}
                        className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
                      />
                      <div className="flex items-center gap-2">
                        <label className={`text-[10px] ${TEXT.muted}`}>Importance</label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={editImportance}
                          onChange={(e) => setEditImportance(Number(e.target.value))}
                        />
                        <span className="text-[10px] font-mono">{editImportance.toFixed(2)}</span>
                      </div>
                      {editError && <p className="text-[11px] text-destructive">{editError}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(m.id)} loading={editSaving}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={editSaving}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={`${TEXT.primary} font-sans whitespace-pre-wrap`}>
                      {isLong && !isExpanded ? `${m.value.slice(0, 220)}…` : m.value}
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                          className={`ml-2 text-[10px] font-semibold ${TEXT.link}`}
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </p>
                  )}

                  <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border`}>
                    <div className={`flex flex-wrap items-center gap-3 text-[10px] font-mono ${TEXT.muted}`}>
                      <span>Source: {m.source}</span>
                      <span>Created {formatDate(m.createdAt)}</span>
                      <span>Last used: {formatRelativeTime(m.lastUsedAt)}</span>
                    </div>
                    {!isEditing && (
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => startEdit(m)}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteMemory(m.id)}
                          title="Forget this memory permanently"
                        >
                          Forget
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation modal (shared across all three clear actions) */}
      <Modal isOpen={confirmScope !== null} onClose={() => (clearing ? null : setConfirmScope(null))} title={confirmScope ? CLEAR_SCOPE_COPY[confirmScope].title : undefined}>
        {confirmScope && (
          <div className="space-y-4">
            <p className={`text-xs ${TEXT.muted}`}>{CLEAR_SCOPE_COPY[confirmScope].body(selectedProjectName)}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmScope(null)} disabled={clearing}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => performClear(confirmScope)} loading={clearing}>
                Yes, delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
