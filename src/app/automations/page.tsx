'use client';

// Phase 88 Part A — AI Workflow Automation. List page at `/automations`. Additive, standalone
// feature — does NOT touch the existing `/workflows` pages (Phase 35 "AI Workflow Builder", a
// different, unrelated feature) or `src/features/workflow/` (singular).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { SURFACE, FOCUS_RING } from '@/lib/design-system/theme.constants';
import { createAutomation, fetchAutomations } from './automationsApi';
import {
  AUTOMATION_STATUS_BADGE,
  EXECUTION_STATUS_BADGE,
  TRIGGER_TYPE_LABEL,
  formatRelativeTime,
  formatSuccessRate,
  type AutomationSummaryDTO
} from './automation.types';

interface ProjectOption {
  id: string;
  name: string;
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <Card className="animate-pulse" style={{ animationDelay: `${index * 75}ms` }}>
      <div className="h-4 w-1/3 rounded bg-muted mb-3" />
      <div className="h-3 w-2/3 rounded bg-muted mb-2" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </Card>
  );
}

export default function AutomationsListPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<AutomationSummaryDTO[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAutomations();
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAutomations(res.data);
  }, []);

  useEffect(() => {
    void load();
    fetch('/api/projects')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) setProjects((json.data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, [load]);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    // Minimal starter definition: a single TRIGGER wired straight to an END node — the smallest
    // graph that's structurally coherent for the editor to open into, rather than an empty canvas.
    const res = await createAutomation({
      name: newName.trim(),
      definition: {
        nodes: [
          { key: 'trigger-1', type: 'TRIGGER', position: { x: 0, y: 0 }, config: {} },
          { key: 'end-1', type: 'END', position: { x: 0, y: 160 }, config: {} }
        ],
        edges: [{ id: 'e-trigger-1-end-1', source: 'trigger-1', target: 'end-1', condition: null }]
      }
    });
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.message);
      return;
    }
    setCreateModalOpen(false);
    setNewName('');
    router.push(`/automations/${res.data.id}`);
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">⚙️</span>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Automations</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            React automatically to risks, deadlines, and meeting outcomes with AI-driven workflows.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => void load()}>↻ Refresh</Button>
          <Button variant="primary" size="md" onClick={() => setCreateModalOpen(true)}>+ New Automation</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} index={i} />)}
        </div>
      ) : error ? (
        <Card className="text-center py-10 space-y-3">
          <span className="text-3xl block" aria-hidden="true">⚠️</span>
          <h2 className="text-base font-bold text-foreground">Something went wrong</h2>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : automations.length === 0 ? (
        <Card className="text-center py-12 space-y-3">
          <span className="text-3xl block" aria-hidden="true">⚙️</span>
          <h2 className="text-base font-bold text-foreground">No automations yet</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Create one to react automatically to risks, deadlines, and meeting outcomes.
          </p>
          <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>+ New Automation</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Link key={a.id} href={`/automations/${a.id}`} className="block">
              <Card interactive className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-foreground truncate">{a.name}</h3>
                    <Badge variant={AUTOMATION_STATUS_BADGE[a.status]}>{a.status}</Badge>
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground line-clamp-1">{a.description}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {a.triggerTypes.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">No triggers configured</span>
                    ) : (
                      a.triggerTypes.map((t) => (
                        <Badge key={t} variant="neutral" className="!text-[9px]">{TRIGGER_TYPE_LABEL[t]}</Badge>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-shrink-0 text-xs">
                  <div className="min-w-[110px]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Last Execution</p>
                    {a.lastExecutionAt ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-foreground">{formatRelativeTime(a.lastExecutionAt)}</span>
                        {a.lastExecutionStatus && (
                          <Badge variant={EXECUTION_STATUS_BADGE[a.lastExecutionStatus]} className="!text-[9px]">
                            {a.lastExecutionStatus}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="min-w-[80px]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Success (7d)</p>
                    <span className="text-foreground font-mono">{formatSuccessRate(a.successRate7d)}</span>
                  </div>

                  <div className="min-w-[90px]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Scope</p>
                    <span className="text-foreground">
                      {a.projectId ? projectNameById.get(a.projectId) || 'Project' : 'Personal'}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal isOpen={createModalOpen} onClose={() => (creating ? null : setCreateModalOpen(false))} title="New Automation" maxWidthClassName="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground block mb-1">Name</label>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder="e.g. Escalate critical risks to ClickUp"
              className={`w-full rounded-xl ${SURFACE.input} px-3 py-2 text-sm ${FOCUS_RING}`}
            />
          </div>
          {createError && <p className="text-xs text-destructive">{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" disabled={creating} onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={creating} onClick={() => void handleCreate()}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
