'use client';

// Phase 84 — AI Knowledge Graph Explorer. Additive, standalone page — does not touch the
// existing /knowledge-graph, /knowledge-graph/[entityId], or /projects/[id]/knowledge pages.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { FeatureLockedModal } from '@/components/billing/FeatureLockedModal';
import { FOCUS_RING, SURFACE, TRANSITION } from '@/lib/design-system/theme.constants';
import NodeDetailsPanel from './NodeDetailsPanel';
import {
  askAboutNode,
  classifyExplorerFailure,
  explainConnection,
  fetchGraph,
  fetchKnowledgeBases,
  fetchNodeDetail,
  fetchNodeNeighbors,
  fetchProjects,
  fetchRelationshipTypes,
  type ExplorerApiResult
} from './explorerApi';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_BADGE_VARIANT,
  RELATIONSHIP_TYPES,
  type AskAboutNodeResult,
  type ConnectionExplanationDTO,
  type ExplorerEdgeDTO,
  type ExplorerNodeDTO,
  type ExplorerNodeDetailDTO,
  type ExplorerScope,
  type GraphExplorerResponseDTO,
  type KnowledgeBaseOption,
  type ProjectOption
} from './explorer.types';

const ExplorerGraphCanvas = dynamic(() => import('./ExplorerGraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground animate-pulse">
      Loading interactive graph canvas...
    </div>
  )
});

const MIN_CONFIDENCE_OPTIONS = [
  { value: 0, label: 'Any confidence' },
  { value: 0.5, label: '50%+' },
  { value: 0.7, label: '70%+' },
  { value: 0.9, label: '90%+' }
];

/** entitlementService.requireFeature() throws `AuthorizationError('This feature is available on
 * a higher plan. Current plan: {planCode}.')` — pull the plan code out for FeatureLockedModal's
 * optional `currentPlanCode` prop rather than only showing the generic upsell copy. */
function extractPlanCode(message: string): string | undefined {
  const match = message.match(/current plan:\s*([A-Za-z0-9_-]+)/i);
  return match?.[1];
}

function applyFailure(
  res: Extract<ExplorerApiResult<unknown>, { ok: false }>,
  setters: {
    locked: (_v: boolean) => void;
    disabled: (_v: boolean) => void;
    error: (_v: string) => void;
    planCode?: (_v: string | undefined) => void;
  }
) {
  const kind = classifyExplorerFailure(res);
  if (kind === 'locked') {
    setters.locked(true);
    setters.planCode?.(extractPlanCode(res.message));
  } else if (kind === 'disabled') {
    setters.disabled(true);
  } else {
    setters.error(res.message);
  }
}

function KnowledgeGraphExplorerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const didInit = useRef(false);

  // Query / scope / filters
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ExplorerScope>('PRIVATE');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | undefined>(undefined);
  const [depth, setDepth] = useState(2);
  const [entityTypeFilter, setEntityTypeFilter] = useState<Set<string>>(new Set());
  const [relationshipTypeFilter, setRelationshipTypeFilter] = useState<Set<string>>(new Set());
  const [minConfidence, setMinConfidence] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Pickers
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [availableRelationshipTypes, setAvailableRelationshipTypes] = useState<string[]>([]);

  // Graph query state
  const [graphData, setGraphData] = useState<GraphExplorerResponseDTO | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [featureLocked, setFeatureLocked] = useState(false);
  const [lockedPlanCode, setLockedPlanCode] = useState<string | undefined>(undefined);
  const [truncatedDismissed, setTruncatedDismissed] = useState(false);
  const [autoExploreOnce, setAutoExploreOnce] = useState(false);

  // Selection / detail
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [nodeDetail, setNodeDetail] = useState<ExplorerNodeDetailDTO | null>(null);
  const [nodeDetailLoading, setNodeDetailLoading] = useState(false);
  const [nodeDetailError, setNodeDetailError] = useState<string | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  // Ask AI
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState<AskAboutNodeResult | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  // Explain relationship
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<ConnectionExplanationDTO | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainModalOpen, setExplainModalOpen] = useState(false);

  const scopeParams = useMemo(
    () => ({
      scope,
      projectId: scope === 'PROJECT' ? projectId : undefined,
      knowledgeBaseId: scope === 'KNOWLEDGE_BASE' ? knowledgeBaseId : undefined
    }),
    [scope, projectId, knowledgeBaseId]
  );

  // Load project/knowledge-base pickers once, up front.
  useEffect(() => {
    fetchProjects().then((res) => {
      if (res.ok) setProjects(res.data);
    });
    fetchKnowledgeBases().then((res) => {
      if (res.ok) setKnowledgeBases(res.data);
    });
  }, []);

  // Populate the relationship-type filter with only the types that actually exist for this scope.
  useEffect(() => {
    if (scope === 'PROJECT' && !projectId) return;
    if (scope === 'KNOWLEDGE_BASE' && !knowledgeBaseId) return;
    fetchRelationshipTypes(scopeParams).then((res) => {
      if (res.ok) setAvailableRelationshipTypes(res.data);
    });
  }, [scopeParams, scope, projectId, knowledgeBaseId]);

  const handleExplore = useCallback(async () => {
    if (scope === 'PROJECT' && !projectId) {
      setValidationError('Select a project to explore.');
      return;
    }
    if (scope === 'KNOWLEDGE_BASE' && !knowledgeBaseId) {
      setValidationError('Select a knowledge base to explore.');
      return;
    }
    setValidationError(null);
    setLoading(true);
    setError(null);
    setFeatureDisabled(false);
    setFeatureLocked(false);
    setSelectedNodeIds([]);
    setTruncatedDismissed(false);

    const res = await fetchGraph({
      scope,
      projectId: scope === 'PROJECT' ? projectId : undefined,
      knowledgeBaseId: scope === 'KNOWLEDGE_BASE' ? knowledgeBaseId : undefined,
      q: query,
      depth,
      entityTypes: Array.from(entityTypeFilter),
      relationshipTypes: Array.from(relationshipTypeFilter),
      minConfidence: minConfidence || undefined
    });

    setLoading(false);
    setHasSearched(true);

    if (!res.ok) {
      applyFailure(res, { locked: setFeatureLocked, disabled: setFeatureDisabled, error: setError, planCode: setLockedPlanCode });
      return;
    }

    setGraphData(res.data);

    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('scope', scope);
    if (scope === 'PROJECT' && projectId) params.set('projectId', projectId);
    if (scope === 'KNOWLEDGE_BASE' && knowledgeBaseId) params.set('knowledgeBaseId', knowledgeBaseId);
    params.set('depth', String(depth));
    router.replace(`/knowledge-graph/explorer?${params.toString()}`, { scroll: false });
  }, [scope, projectId, knowledgeBaseId, query, depth, entityTypeFilter, relationshipTypeFilter, minConfidence, router]);

  const handleClear = useCallback(() => {
    setQuery('');
    setGraphData(null);
    setHasSearched(false);
    setSelectedNodeIds([]);
    setError(null);
    setFeatureDisabled(false);
    setFeatureLocked(false);
    setValidationError(null);
    router.replace('/knowledge-graph/explorer', { scroll: false });
  }, [router]);

  // One-time init from the URL (shareable-link support). Runs before the auto-explore effect.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const q = searchParams.get('q') || '';
    const scopeParam = searchParams.get('scope');
    const projectIdParam = searchParams.get('projectId') || undefined;
    const kbIdParam = searchParams.get('knowledgeBaseId') || undefined;
    const depthParam = Math.min(3, Math.max(1, Number(searchParams.get('depth')) || 2));

    setQuery(q);
    if (scopeParam === 'PRIVATE' || scopeParam === 'PROJECT' || scopeParam === 'KNOWLEDGE_BASE') setScope(scopeParam);
    if (projectIdParam) setProjectId(projectIdParam);
    if (kbIdParam) setKnowledgeBaseId(kbIdParam);
    setDepth(depthParam);

    if (q) setAutoExploreOnce(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run exactly once on mount
  }, []);

  useEffect(() => {
    if (!autoExploreOnce) return;
    setAutoExploreOnce(false);
    void handleExplore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once after mount-time state settles
  }, [autoExploreOnce]);

  const fetchDetailForNode = useCallback(
    async (nodeId: string) => {
      setNodeDetailLoading(true);
      setNodeDetailError(null);
      const res = await fetchNodeDetail(nodeId, scopeParams);
      setNodeDetailLoading(false);
      if (!res.ok) {
        applyFailure(res, { locked: setFeatureLocked, disabled: setFeatureDisabled, error: setNodeDetailError, planCode: setLockedPlanCode });
        return;
      }
      setNodeDetail(res.data);
    },
    [scopeParams]
  );

  const handleNodeClick = useCallback((nodeId: string, shiftKey: boolean) => {
    setSelectedNodeIds((prev) => {
      if (shiftKey) {
        if (prev.includes(nodeId)) return prev.filter((id) => id !== nodeId);
        if (prev.length === 0) return [nodeId];
        if (prev.length === 1) return [...prev, nodeId];
        const anchor = prev[0];
        return anchor === undefined ? [nodeId] : [anchor, nodeId];
      }
      return [nodeId];
    });
  }, []);

  const handleSelectNode = useCallback((nodeId: string) => handleNodeClick(nodeId, false), [handleNodeClick]);

  useEffect(() => {
    setAskResult(null);
    setAskError(null);
    const soleSelectedId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : undefined;
    if (soleSelectedId !== undefined) {
      void fetchDetailForNode(soleSelectedId);
    } else {
      setNodeDetail(null);
      setNodeDetailError(null);
    }
  }, [selectedNodeIds, fetchDetailForNode]);

  // Escape clears selection / closes overlays.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (explainModalOpen) {
        setExplainModalOpen(false);
        return;
      }
      if (featureLocked) {
        setFeatureLocked(false);
        return;
      }
      if (selectedNodeIds.length > 0) setSelectedNodeIds([]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [explainModalOpen, featureLocked, selectedNodeIds.length]);

  const handleExpand = useCallback(
    async (nodeId: string) => {
      setExpandLoading(true);
      const res = await fetchNodeNeighbors(nodeId, { ...scopeParams, depth: 1 });
      setExpandLoading(false);
      if (!res.ok) {
        applyFailure(res, { locked: setFeatureLocked, disabled: setFeatureDisabled, error: setError, planCode: setLockedPlanCode });
        return;
      }
      setGraphData((prev) => {
        if (!prev) return res.data;
        const nodeMap = new Map(prev.nodes.map((n) => [n.id, n]));
        res.data.nodes.forEach((n) => nodeMap.set(n.id, n));
        const edgeMap = new Map(prev.edges.map((e) => [e.id, e]));
        res.data.edges.forEach((e) => edgeMap.set(e.id, e));
        const mergedNodes = Array.from(nodeMap.values());
        const mergedEdges = Array.from(edgeMap.values());
        return { ...prev, nodes: mergedNodes, edges: mergedEdges, totalNodes: mergedNodes.length, totalEdges: mergedEdges.length };
      });
    },
    [scopeParams]
  );

  const handleAskSubmit = useCallback(
    async (question: string) => {
      if (selectedNodeIds.length !== 1) return;
      const nodeId = selectedNodeIds[0];
      if (nodeId === undefined) return;
      setAskLoading(true);
      setAskError(null);
      setAskResult(null);
      const res = await askAboutNode(nodeId, {
        question,
        scope,
        projectId: scopeParams.projectId,
        knowledgeBaseId: scopeParams.knowledgeBaseId
      });
      setAskLoading(false);
      if (!res.ok) {
        applyFailure(res, { locked: setFeatureLocked, disabled: setFeatureDisabled, error: setAskError, planCode: setLockedPlanCode });
        return;
      }
      setAskResult(res.data);
    },
    [selectedNodeIds, scope, scopeParams]
  );

  const handleExplainRelationship = useCallback(async () => {
    if (selectedNodeIds.length !== 2) return;
    const [sourceEntityId, targetEntityId] = selectedNodeIds;
    if (sourceEntityId === undefined || targetEntityId === undefined) return;
    setExplainLoading(true);
    setExplainError(null);
    setExplainResult(null);
    setExplainModalOpen(true);
    const res = await explainConnection({
      sourceEntityId,
      targetEntityId,
      projectId: scope === 'PROJECT' ? projectId : undefined
    });
    setExplainLoading(false);
    if (!res.ok) {
      applyFailure(res, { locked: setFeatureLocked, disabled: setFeatureDisabled, error: setExplainError, planCode: setLockedPlanCode });
      return;
    }
    setExplainResult(res.data);
  }, [selectedNodeIds, scope, projectId]);

  const toggleEntityType = (type: string) => {
    setEntityTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleRelationshipType = (type: string) => {
    setRelationshipTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Client-side filtering — applied regardless of whether the backend also honors these
  // params, so the filter UI is always functional.
  const visibleNodes: ExplorerNodeDTO[] = useMemo(() => {
    if (!graphData) return [];
    return graphData.nodes.filter((n) => {
      if (entityTypeFilter.size > 0 && !entityTypeFilter.has(n.entityType)) return false;
      if (minConfidence > 0 && n.confidence < minConfidence) return false;
      return true;
    });
  }, [graphData, entityTypeFilter, minConfidence]);

  const visibleEdges: ExplorerEdgeDTO[] = useMemo(() => {
    if (!graphData) return [];
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    return graphData.edges.filter((e) => {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return false;
      if (relationshipTypeFilter.size > 0 && !relationshipTypeFilter.has(e.relationshipType)) return false;
      return true;
    });
  }, [graphData, visibleNodes, relationshipTypeFilter]);

  const nodeNameById = useMemo(() => {
    const map = new Map<string, string>();
    graphData?.nodes.forEach((n) => map.set(n.id, n.canonicalName));
    return map;
  }, [graphData]);

  const relationshipTypeOptions = availableRelationshipTypes.length > 0 ? availableRelationshipTypes : RELATIONSHIP_TYPES;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-4">
      {/* Header / Controls */}
      <div className={`${SURFACE.card} rounded-2xl p-5 space-y-4 shadow-sm`}>
        <div>
          <h1 className="text-xl font-extrabold text-foreground">AI Knowledge Graph Explorer</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Search, visualize, and reason over entities and relationships extracted from your documents.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleExplore();
          }}
          className="flex flex-col md:flex-row gap-3 md:items-center"
        >
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entities, e.g. &quot;payments service&quot;..."
              aria-label="Search knowledge graph"
              className={`flex-1 rounded-xl ${SURFACE.input} px-3.5 py-2.5 text-sm ${FOCUS_RING}`}
            />
            <Button type="submit" variant="primary" size="md" loading={loading}>Explore</Button>
            <Button type="button" variant="ghost" size="md" onClick={handleClear}>Clear</Button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Scope</span>
            {(['PRIVATE', 'PROJECT', 'KNOWLEDGE_BASE'] as ExplorerScope[]).map((s) => (
              <Button
                key={s}
                type="button"
                variant={scope === s ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setScope(s)}
              >
                {s === 'PRIVATE' ? 'Private' : s === 'PROJECT' ? 'Project' : 'Knowledge Base'}
              </Button>
            ))}

            {scope === 'PROJECT' && (
              <select
                value={projectId || ''}
                onChange={(e) => setProjectId(e.target.value || undefined)}
                aria-label="Select project"
                className={`rounded-xl ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {scope === 'KNOWLEDGE_BASE' && (
              <select
                value={knowledgeBaseId || ''}
                onChange={(e) => setKnowledgeBaseId(e.target.value || undefined)}
                aria-label="Select knowledge base"
                className={`rounded-xl ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              >
                <option value="">Select a knowledge base…</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide" htmlFor="explorer-depth">
              Depth
            </label>
            <select
              id="explorer-depth"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className={`rounded-xl ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
            >
              <option value={1}>1 hop</option>
              <option value={2}>2 hops</option>
              <option value={3}>3 hops</option>
            </select>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? 'Hide Filters' : 'Filters'}
            </Button>
          </div>
        </div>

        {validationError && <p className="text-xs text-destructive">{validationError}</p>}

        {filtersOpen && (
          <div className="border-t border-border pt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Entity Types</h3>
                {entityTypeFilter.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setEntityTypeFilter(new Set())}
                    className={`text-[11px] text-primary hover:text-primary-hover ${FOCUS_RING} rounded`}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                {ENTITY_TYPES.map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] cursor-pointer hover:bg-accent ${TRANSITION.base}`}
                  >
                    <input
                      type="checkbox"
                      checked={entityTypeFilter.has(type)}
                      onChange={() => toggleEntityType(type)}
                      className="accent-primary"
                    />
                    <Badge variant={ENTITY_TYPE_BADGE_VARIANT[type] || 'neutral'} className="!text-[9px] !px-1.5">
                      {type}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Relationship Types</h3>
                {relationshipTypeFilter.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setRelationshipTypeFilter(new Set())}
                    className={`text-[11px] text-primary hover:text-primary-hover ${FOCUS_RING} rounded`}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                {relationshipTypeOptions.map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] cursor-pointer hover:bg-accent ${TRANSITION.base}`}
                  >
                    <input
                      type="checkbox"
                      checked={relationshipTypeFilter.has(type)}
                      onChange={() => toggleRelationshipType(type)}
                      className="accent-primary"
                    />
                    <span className="truncate">{type.replace(/_/g, ' ').toLowerCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide" htmlFor="explorer-min-confidence">
                Minimum Confidence
              </label>
              <select
                id="explorer-min-confidence"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className={`rounded-xl ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              >
                {MIN_CONFIDENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {graphData?.truncated && !truncatedDismissed && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          <span>
            Showing the first {graphData.nodes.length} of {graphData.totalNodes} nodes — refine your search to see more.
          </span>
          <button type="button" onClick={() => setTruncatedDismissed(true)} aria-label="Dismiss" className={`${FOCUS_RING} rounded`}>
            ✕
          </button>
        </div>
      )}

      {/* Canvas + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 rounded-2xl border border-border bg-surface/90 overflow-hidden relative shadow-sm min-h-[560px] h-[560px] flex flex-col">
          {!hasSearched && !loading ? (
            <div className="m-auto text-center space-y-3 p-10 max-w-md">
              <span className="text-3xl block" aria-hidden="true">🕸️</span>
              <h2 className="text-base font-bold text-foreground">Explore Your Knowledge</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Search for a concept, person, technology, or document above to visualize the entities and relationships
                extracted from your knowledge base.
              </p>
            </div>
          ) : loading ? (
            <div className="m-auto flex flex-col items-center gap-3 text-muted-foreground">
              <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
              <p className="text-xs">Querying knowledge graph…</p>
            </div>
          ) : featureLocked ? (
            <div className="m-auto text-center space-y-3 p-10 max-w-md">
              <span className="text-3xl block" aria-hidden="true">🔒</span>
              <h2 className="text-base font-bold text-foreground">This feature requires a higher plan</h2>
              <p className="text-xs text-muted-foreground">Upgrade your plan to unlock the Knowledge Graph Explorer.</p>
            </div>
          ) : featureDisabled ? (
            <div className="m-auto text-center space-y-3 p-10 max-w-md">
              <span className="text-3xl block" aria-hidden="true">🛠️</span>
              <h2 className="text-base font-bold text-foreground">Not Yet Enabled</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The Knowledge Graph Explorer is not yet enabled for this workspace. Ask a workspace admin to turn it on.
              </p>
            </div>
          ) : error ? (
            <div className="m-auto text-center space-y-3 p-10 max-w-md">
              <span className="text-3xl block" aria-hidden="true">⚠️</span>
              <h2 className="text-base font-bold text-foreground">Something went wrong</h2>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void handleExplore()}>Retry</Button>
            </div>
          ) : graphData && graphData.nodes.length === 0 ? (
            <div className="m-auto text-center space-y-3 p-10 max-w-md">
              <span className="text-3xl block" aria-hidden="true">🔍</span>
              <h2 className="text-base font-bold text-foreground">No knowledge found for this query</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Try a broader search term, a wider scope, or run knowledge graph extraction on your documents first.
              </p>
              <Link href="/knowledge-graph">
                <Button variant="outline" size="sm">Go to Knowledge Graph Dashboard</Button>
              </Link>
            </div>
          ) : graphData ? (
            <div className="flex-1">
              <ExplorerGraphCanvas
                nodes={visibleNodes}
                edges={visibleEdges}
                selectedNodeIds={selectedNodeIds}
                onNodeClick={handleNodeClick}
                onPaneClick={() => setSelectedNodeIds([])}
              />
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-1 rounded-2xl border border-border bg-surface p-5 shadow-sm overflow-y-auto max-h-[560px]">
          <h3 className="font-bold text-xs uppercase tracking-wide text-muted-foreground border-b border-border pb-3 mb-4">
            Node Details
          </h3>
          <NodeDetailsPanel
            selectedNodeIds={selectedNodeIds}
            detail={nodeDetail}
            loading={nodeDetailLoading}
            error={nodeDetailError}
            onRetryDetail={() => selectedNodeIds[0] && void fetchDetailForNode(selectedNodeIds[0])}
            onClearSelection={() => setSelectedNodeIds([])}
            onSelectNode={handleSelectNode}
            expandLoading={expandLoading}
            onExpand={handleExpand}
            askLoading={askLoading}
            askResult={askResult}
            askError={askError}
            onAskSubmit={handleAskSubmit}
            explainLoading={explainLoading}
            onExplainRelationship={handleExplainRelationship}
          />
        </div>
      </div>

      <FeatureLockedModal
        isOpen={featureLocked}
        onClose={() => setFeatureLocked(false)}
        featureName="Knowledge Graph Explorer"
        currentPlanCode={lockedPlanCode}
      />

      <Modal isOpen={explainModalOpen} onClose={() => setExplainModalOpen(false)} title="Explain Relationship" maxWidthClassName="max-w-lg">
        {selectedNodeIds.length === 2 && (
          <p className="text-xs text-muted-foreground -mt-2">
            {(selectedNodeIds[0] && nodeNameById.get(selectedNodeIds[0])) || 'Node A'} ↔{' '}
            {(selectedNodeIds[1] && nodeNameById.get(selectedNodeIds[1])) || 'Node B'}
          </p>
        )}
        {explainLoading ? (
          <div className="flex items-center gap-3 py-6 text-xs text-muted-foreground">
            <div className="w-6 h-6 rounded-full border-2 border-border border-t-primary animate-spin" />
            Asking the AI to explain this connection…
          </div>
        ) : explainError ? (
          <p className="text-xs text-destructive">{explainError}</p>
        ) : explainResult ? (
          <div className="space-y-3 text-xs">
            <p className="text-foreground leading-relaxed">{explainResult.summary}</p>
            {explainResult.supportingCitations.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Supporting Evidence</h4>
                <ul className="space-y-1.5">
                  {explainResult.supportingCitations.map((c, idx) => (
                    <li key={`${c.chunkId}-${idx}`} className="rounded-lg border border-border p-2 space-y-1">
                      {c.snippet && <p className="text-muted-foreground line-clamp-2">&ldquo;{c.snippet}&rdquo;</p>}
                      <Link href={`/documents/${c.documentId}`}>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">Open Document</Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// `useSearchParams()` (used above for shareable-link URL sync) requires a Suspense boundary in
// the Next.js App Router, or the page fails static-shell prerendering at build time — this
// wrapper is the only change from the inner component; behavior is otherwise identical.
export default function KnowledgeGraphExplorerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center text-xs text-muted-foreground animate-pulse">
          Loading Knowledge Graph Explorer...
        </div>
      }
    >
      <KnowledgeGraphExplorerPageInner />
    </Suspense>
  );
}
