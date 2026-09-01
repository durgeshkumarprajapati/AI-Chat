'use client';

// Phase 88 Part A — AI Workflow Automation. Detail + graph editor page at `/automations/[id]`.
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SURFACE, FOCUS_RING } from '@/lib/design-system/theme.constants';
import {
  archiveAutomation,
  createTriggerBinding,
  deleteTriggerBinding,
  fetchAutomation,
  fetchVersionDetail,
  publishVersion,
  setTriggerBindingEnabled,
  updateAutomation
} from '../automationsApi';
import {
  AUTOMATION_NODE_TYPES,
  AUTOMATION_STATUS_BADGE,
  NODE_TYPE_ICON,
  NODE_TYPE_LABEL,
  validateDefinition,
  type AutomationDefinitionDTO,
  type AutomationDetailDTO,
  type AutomationEdgeDTO,
  type AutomationNodeType,
  type AutomationTriggerBindingDTO,
  type AutomationTriggerType
} from '../automation.types';
import TriggerBindingsPanel from './TriggerBindingsPanel';
import VersionHistoryPanel from './VersionHistoryPanel';
import AutomationInspectorPanel from './AutomationInspectorPanel';

const AutomationGraphCanvas = dynamic(() => import('./AutomationGraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground animate-pulse">
      Loading workflow editor...
    </div>
  )
});

function draftStorageKey(automationId: string, baseVersionNumber: number | null): string {
  return `automation-draft:${automationId}:${baseVersionNumber ?? 'unpublished'}`;
}

function loadStoredDraft(automationId: string, baseVersionNumber: number | null): AutomationDefinitionDTO | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(automationId, baseVersionNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return parsed as AutomationDefinitionDTO;
  } catch {
    // corrupt/unavailable storage — fall through to null
  }
  return null;
}

function storeDraft(automationId: string, baseVersionNumber: number | null, def: AutomationDefinitionDTO) {
  try {
    window.localStorage.setItem(draftStorageKey(automationId, baseVersionNumber), JSON.stringify(def));
  } catch {
    // best-effort only
  }
}

function clearStoredDraft(automationId: string, baseVersionNumber: number | null) {
  try {
    window.localStorage.removeItem(draftStorageKey(automationId, baseVersionNumber));
  } catch {
    // best-effort only
  }
}

function definitionsEqual(a: AutomationDefinitionDTO, b: AutomationDefinitionDTO): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let nodeKeyCounter = 0;
function generateNodeKey(type: AutomationNodeType): string {
  nodeKeyCounter += 1;
  return `${type.toLowerCase()}-${Date.now().toString(36)}-${nodeKeyCounter}`;
}

const EMPTY_DEFINITION: AutomationDefinitionDTO = { nodes: [], edges: [] };

export default function AutomationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [automation, setAutomation] = useState<AutomationDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The live, in-memory editable draft. Per the spec, editing a DRAFT automation mutates a
  // local/staged definition — the locked contract has no "save draft" route, only
  // POST /versions (publish). Persisted to localStorage keyed by the base version number so a
  // refresh doesn't discard in-progress edits; cleared on a successful publish.
  const [draft, setDraft] = useState<AutomationDefinitionDTO>(EMPTY_DEFINITION);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Read-only historical version being viewed, if any.
  const [viewingVersionNumber, setViewingVersionNumber] = useState<number | null>(null);
  const [viewingDefinition, setViewingDefinition] = useState<AutomationDefinitionDTO | null>(null);
  const [viewingError, setViewingError] = useState<string | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [serverErrorsByNode, setServerErrorsByNode] = useState<Record<string, string[]>>({});

  const baseVersionNumber = automation?.currentVersion?.versionNumber ?? null;
  const publishedDefinition = automation?.currentVersion?.definition ?? EMPTY_DEFINITION;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAutomation(id);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setAutomation(res.data);
    const base = res.data.currentVersion?.definition ?? EMPTY_DEFINITION;
    const stored = loadStoredDraft(id, res.data.currentVersion?.versionNumber ?? null);
    setDraft(stored || base);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Persist the in-progress draft on every change (best-effort, per-viewer convenience only).
  useEffect(() => {
    if (!automation) return;
    storeDraft(id, baseVersionNumber, draft);
  }, [draft, id, baseVersionNumber, automation]);

  const isDirty = useMemo(() => !definitionsEqual(draft, publishedDefinition), [draft, publishedDefinition]);

  // Standard beforeunload guard, per spec.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const clientErrorsByNode = useMemo(() => validateDefinition(viewingDefinition || draft), [draft, viewingDefinition]);
  const combinedErrorsByNode = useMemo(() => {
    const merged: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(clientErrorsByNode)) merged[k] = [...v];
    for (const [k, v] of Object.entries(serverErrorsByNode)) merged[k] = [...(merged[k] || []), ...v];
    return merged;
  }, [clientErrorsByNode, serverErrorsByNode]);

  const readOnly = viewingVersionNumber !== null;
  const activeDefinition = readOnly ? viewingDefinition || EMPTY_DEFINITION : draft;

  function mutateDraft(updater: (_d: AutomationDefinitionDTO) => AutomationDefinitionDTO) {
    if (readOnly) return;
    setPublishError(null);
    setServerErrorsByNode({});
    setDraft((prev) => updater(prev));
  }

  const handleNodePositionChange = useCallback((nodeKey: string, position: { x: number; y: number }) => {
    mutateDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.key === nodeKey ? { ...n, position } : n)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const handleConnect = useCallback((source: string, target: string) => {
    mutateDraft((d) => ({
      ...d,
      edges: [...d.edges, { id: `e-${source}-${target}-${Date.now().toString(36)}`, source, target, condition: null }]
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const handleDeleteNode = useCallback((nodeKey: string) => {
    mutateDraft((d) => ({
      nodes: d.nodes.filter((n) => n.key !== nodeKey),
      edges: d.edges.filter((e) => e.source !== nodeKey && e.target !== nodeKey)
    }));
    setSelectedNodeKey((k) => (k === nodeKey ? null : k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    mutateDraft((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== edgeId) }));
    setSelectedEdgeId((k) => (k === edgeId ? null : k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const handleNodeConfigChange = useCallback((nodeKey: string, config: Record<string, unknown>) => {
    mutateDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.key === nodeKey ? { ...n, config } : n)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const handleEdgeConditionChange = useCallback((edgeId: string, condition: AutomationEdgeDTO['condition']) => {
    mutateDraft((d) => ({ ...d, edges: d.edges.map((e) => (e.id === edgeId ? { ...e, condition } : e)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  function handleAddNode(type: AutomationNodeType) {
    if (readOnly) return;
    const key = generateNodeKey(type);
    const count = draft.nodes.length;
    const position = { x: (count % 4) * 220, y: 260 + Math.floor(count / 4) * 140 };
    setDraft((d) => ({ ...d, nodes: [...d.nodes, { key, type, position, config: {} }] }));
    setSelectedEdgeId(null);
    setSelectedNodeKey(key);
  }

  async function handlePublish() {
    if (readOnly) return;
    setPublishing(true);
    setPublishError(null);
    setServerErrorsByNode({});
    const res = await publishVersion(id, draft);
    setPublishing(false);
    if (!res.ok) {
      setPublishError(res.message);
      if (res.fieldErrors) setServerErrorsByNode(res.fieldErrors);
      return;
    }
    clearStoredDraft(id, baseVersionNumber);
    await load();
  }

  async function handleSelectVersion(versionNumber: number) {
    if (!automation) return;
    const ref = automation.versions.find((v) => v.versionNumber === versionNumber);
    if (!ref) return;
    setSelectedNodeKey(null);
    setSelectedEdgeId(null);
    setViewingVersionNumber(versionNumber);
    setViewingError(null);
    if (versionNumber === automation.currentVersion?.versionNumber) {
      setViewingDefinition(automation.currentVersion.definition);
      return;
    }
    setViewingLoading(true);
    const res = await fetchVersionDetail(id, ref.id);
    setViewingLoading(false);
    if (!res.ok) {
      setViewingError('This version’s definition is not available to preview.');
      setViewingDefinition(null);
      return;
    }
    setViewingDefinition(res.data.definition);
  }

  function handleReturnToDraft() {
    setViewingVersionNumber(null);
    setViewingDefinition(null);
    setViewingError(null);
    setSelectedNodeKey(null);
    setSelectedEdgeId(null);
  }

  async function handleSaveName() {
    if (!automation || !nameDraft.trim() || nameDraft.trim() === automation.name) {
      setNameEditing(false);
      return;
    }
    const res = await updateAutomation(id, { name: nameDraft.trim() });
    if (res.ok) setAutomation(res.data);
    setNameEditing(false);
  }

  async function handleToggleStatus() {
    if (!automation) return;
    const next = automation.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setStatusBusy(true);
    const res = await updateAutomation(id, { status: next });
    setStatusBusy(false);
    if (res.ok) setAutomation(res.data);
  }

  async function handleArchive() {
    if (!automation) return;
    if (!window.confirm('Archive this automation? It will stop running and be moved out of the active list.')) return;
    setArchiveBusy(true);
    const res = await archiveAutomation(id);
    setArchiveBusy(false);
    if (res.ok) router.push('/automations');
  }

  async function handleAddTrigger(triggerType: AutomationTriggerType) {
    const res = await createTriggerBinding(id, { triggerType });
    if (res.ok) await load();
  }

  async function handleToggleTrigger(binding: AutomationTriggerBindingDTO, enabled: boolean) {
    const res = await setTriggerBindingEnabled(id, binding, enabled);
    if (res.ok) await load();
  }

  async function handleDeleteTrigger(binding: AutomationTriggerBindingDTO) {
    const res = await deleteTriggerBinding(id, binding.id);
    if (res.ok) await load();
  }

  const selectedNode = activeDefinition.nodes.find((n) => n.key === selectedNodeKey) || null;
  const selectedEdge = activeDefinition.edges.find((e) => e.id === selectedEdgeId) || null;

  if (loading) {
    return (
      <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !automation) {
    return (
      <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="text-center py-10 space-y-3">
          <span className="text-3xl block" aria-hidden="true">⚠️</span>
          <h2 className="text-base font-bold text-foreground">Couldn&apos;t load this automation</h2>
          <p className="text-xs text-muted-foreground">{error || 'Not found.'}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {nameEditing ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => void handleSaveName()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName();
                    if (e.key === 'Escape') setNameEditing(false);
                  }}
                  className={`rounded-lg ${SURFACE.input} px-2 py-1 text-xl font-bold ${FOCUS_RING}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(automation.name);
                    setNameEditing(true);
                  }}
                  className={`text-xl font-bold text-foreground hover:text-primary text-left ${FOCUS_RING} rounded`}
                  title="Click to rename"
                >
                  {automation.name}
                </button>
              )}
              <Badge variant={AUTOMATION_STATUS_BADGE[automation.status]}>{automation.status}</Badge>
              {automation.currentVersion && <Badge variant="neutral">v{automation.currentVersion.versionNumber}</Badge>}
            </div>
            {automation.description && <p className="text-xs text-muted-foreground mt-1">{automation.description}</p>}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Link href={`/automations/${id}/executions`}>
              <Button variant="outline" size="sm">View Executions</Button>
            </Link>
            {(automation.status === 'ACTIVE' || automation.status === 'PAUSED') && (
              <Button variant={automation.status === 'ACTIVE' ? 'secondary' : 'success'} size="sm" loading={statusBusy} onClick={() => void handleToggleStatus()}>
                {automation.status === 'ACTIVE' ? 'Pause' : 'Activate'}
              </Button>
            )}
            {automation.status !== 'ARCHIVED' && (
              <Button variant="ghost" size="sm" className="text-destructive" loading={archiveBusy} onClick={() => void handleArchive()}>
                Archive
              </Button>
            )}
          </div>
        </div>

        {isDirty && !readOnly && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
            <span>You have unsaved changes to this workflow&apos;s definition. Publish to save them as a new version.</span>
            <Button variant="primary" size="sm" loading={publishing} onClick={() => void handlePublish()}>Publish</Button>
          </div>
        )}
        {readOnly && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-xs text-info">
            <span>Viewing v{viewingVersionNumber} read-only. Editing always starts a new draft from the current version.</span>
            <Button variant="outline" size="sm" onClick={handleReturnToDraft}>Back to Draft</Button>
          </div>
        )}
        {publishError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
            Publish failed: {publishError}
          </div>
        )}
      </div>

      {/* Node toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground mr-1">Add node:</span>
          {AUTOMATION_NODE_TYPES.map((t) => (
            <Button key={t} variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => handleAddNode(t)}>
              {NODE_TYPE_ICON[t]} {NODE_TYPE_LABEL[t]}
            </Button>
          ))}
        </div>
      )}

      {/* Canvas + side panels */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 rounded-2xl border border-border bg-surface/90 overflow-hidden relative shadow-sm min-h-[560px] h-[560px]">
          {viewingLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground animate-pulse">Loading version…</div>
          ) : viewingError ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <p className="text-xs text-muted-foreground max-w-xs">{viewingError}</p>
            </div>
          ) : (
            <AutomationGraphCanvas
              nodes={activeDefinition.nodes}
              edges={activeDefinition.edges}
              selectedNodeKey={selectedNodeKey}
              selectedEdgeId={selectedEdgeId}
              errorsByNode={readOnly ? {} : combinedErrorsByNode}
              readOnly={readOnly}
              onNodePositionChange={handleNodePositionChange}
              onSelectNode={(key) => {
                setSelectedNodeKey(key);
                setSelectedEdgeId(null);
              }}
              onSelectEdge={(edgeId) => {
                setSelectedEdgeId(edgeId);
                setSelectedNodeKey(null);
              }}
              onClearSelection={() => {
                setSelectedNodeKey(null);
                setSelectedEdgeId(null);
              }}
              onConnect={handleConnect}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
            />
          )}
        </div>

        <div className="xl:col-span-1 space-y-6">
          <Card className="max-h-[260px] overflow-y-auto">
            <AutomationInspectorPanel
              node={selectedNode}
              edge={selectedEdge}
              readOnly={readOnly}
              onNodeConfigChange={handleNodeConfigChange}
              onDeleteNode={handleDeleteNode}
              onEdgeConditionChange={handleEdgeConditionChange}
              onDeleteEdge={handleDeleteEdge}
            />
          </Card>

          <Card>
            <TriggerBindingsPanel
              bindings={automation.triggerBindings}
              onAdd={handleAddTrigger}
              onToggle={handleToggleTrigger}
              onDelete={handleDeleteTrigger}
            />
          </Card>

          <Card className="max-h-[300px] overflow-y-auto">
            <VersionHistoryPanel
              versions={automation.versions}
              currentVersionNumber={automation.currentVersion?.versionNumber ?? null}
              viewingVersionNumber={viewingVersionNumber}
              onSelectVersion={(v) => void handleSelectVersion(v)}
              onReturnToDraft={handleReturnToDraft}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
