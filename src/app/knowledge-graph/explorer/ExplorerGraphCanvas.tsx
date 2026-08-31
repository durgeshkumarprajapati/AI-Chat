'use client';

// Phase 84 — split out of page.tsx (same reasoning as
// src/app/developer/architecture/ArchitectureGraphCanvas.tsx) so @xyflow/react — the largest
// client dependency in this codebase — loads as its own async chunk via next/dynamic in the
// parent page, instead of shipping in every other page's initial JS.
import { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/Badge';
import { TRANSITION } from '@/lib/design-system/theme.constants';
import {
  ENTITY_TYPE_BADGE_VARIANT,
  CONFIDENCE_BAND_BADGE_VARIANT,
  formatConfidencePercent,
  type ConfidenceBand,
  type ExplorerEdgeDTO,
  type ExplorerNodeDTO
} from './explorer.types';
import type { BadgeVariant } from '@/components/ui/Badge';

interface EntityNodeData extends Record<string, unknown> {
  label: string;
  entityType: string;
  confidence: number;
  confidenceBand: ConfidenceBand;
  status: string;
  dimmed: boolean;
}

/** Custom ReactFlow node — real Tailwind classes (theme-correct), not inline hex, per the
 * Phase 84 spec's deliberate deviation from the architecture-page reference implementation. */
function EntityNode({ data, selected }: NodeProps) {
  const d = data as EntityNodeData;
  const badgeVariant: BadgeVariant = ENTITY_TYPE_BADGE_VARIANT[d.entityType] || 'neutral';

  return (
    <div
      className={`min-w-[168px] max-w-[220px] rounded-xl border px-3 py-2.5 shadow-sm bg-card border-card-border ${TRANSITION.base} ${
        selected ? 'ring-2 ring-primary border-primary shadow-md' : ''
      } ${d.dimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !border-0 !w-2 !h-2" />
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <Badge variant={badgeVariant} className="truncate">{d.entityType}</Badge>
        <Badge variant={CONFIDENCE_BAND_BADGE_VARIANT[d.confidenceBand]}>{formatConfidencePercent(d.confidence)}</Badge>
      </div>
      <p className="text-xs font-semibold text-foreground leading-snug break-words line-clamp-2" title={d.label}>
        {d.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-border !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode };

/** Badge-variant -> CSS custom property, for the one ReactFlow prop (MiniMap's `nodeColor`)
 * that genuinely only accepts a resolved CSS color value, not a Tailwind class — same narrow
 * exception the reference architecture page documents. Referencing the CSS var (not a literal
 * hex) keeps this correct across light/dark without any JS theme detection. */
const MINIMAP_VARIANT_COLOR: Record<BadgeVariant, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  neutral: 'var(--muted-foreground)'
};

/**
 * Deterministic force-directed layout. The Explorer API returns nodes/edges with no position —
 * unlike the architecture page's fixture data — so this computes one. No layout library
 * (dagre/elkjs/d3-force) is installed in this codebase; this is a small, dependency-free
 * spring/repulsion simulation, bounded so it stays fast even at the API's max graph size.
 */
type Point = { x: number; y: number };

function computeLayout(nodeIds: string[], edges: Array<{ source: string; target: string }>): Record<string, Point> {
  const n = nodeIds.length;
  const positions = new Map<string, Point>();
  if (n === 0) return {};

  // Safety valve for unexpectedly large graphs: a cheap grid layout instead of O(n^2) simulation.
  if (n > 400) {
    const cols = Math.ceil(Math.sqrt(n));
    nodeIds.forEach((id, i) => {
      positions.set(id, { x: (i % cols) * 220, y: Math.floor(i / cols) * 160 });
    });
    return Object.fromEntries(positions);
  }

  const idSet = new Set(nodeIds);
  const validEdges = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target);

  const radius = Math.max(220, n * 18);
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  });

  const REPULSION = 12000;
  const SPRING_LENGTH = 190;
  const SPRING_STRENGTH = 0.02;
  const ITERATIONS = n > 150 ? 60 : 200;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = new Map<string, Point>();
    nodeIds.forEach((id) => forces.set(id, { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodeIds[i] as string;
        const b = nodeIds[j] as string;
        const posA = positions.get(a) as Point;
        const posB = positions.get(b) as Point;
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const forceA = forces.get(a) as Point;
        const forceB = forces.get(b) as Point;
        forceA.x += fx;
        forceA.y += fy;
        forceB.x -= fx;
        forceB.y -= fy;
      }
    }

    for (const e of validEdges) {
      const posSource = positions.get(e.source) as Point;
      const posTarget = positions.get(e.target) as Point;
      const dx = posTarget.x - posSource.x;
      const dy = posTarget.y - posSource.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const displacement = dist - SPRING_LENGTH;
      const force = displacement * SPRING_STRENGTH;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const forceSource = forces.get(e.source) as Point;
      const forceTarget = forces.get(e.target) as Point;
      forceSource.x += fx;
      forceSource.y += fy;
      forceTarget.x -= fx;
      forceTarget.y -= fy;
    }

    for (const id of nodeIds) {
      const pos = positions.get(id) as Point;
      const force = forces.get(id) as Point;
      force.x += -pos.x * 0.002;
      force.y += -pos.y * 0.002;
    }

    for (const id of nodeIds) {
      const pos = positions.get(id) as Point;
      const force = forces.get(id) as Point;
      pos.x += Math.max(-40, Math.min(40, force.x));
      pos.y += Math.max(-40, Math.min(40, force.y));
    }
  }

  return Object.fromEntries(positions);
}

export interface ExplorerGraphCanvasProps {
  nodes: ExplorerNodeDTO[];
  edges: ExplorerEdgeDTO[];
  selectedNodeIds: string[];
  onNodeClick: (_nodeId: string, _shiftKey: boolean) => void;
  onPaneClick?: () => void;
}

export default function ExplorerGraphCanvas({ nodes, edges, selectedNodeIds, onNodeClick, onPaneClick }: ExplorerGraphCanvasProps) {
  // Layout only depends on the graph's shape (which node ids / which edges exist), never on
  // selection — so selecting a node never reshuffles the canvas.
  const layoutKey = useMemo(
    () => `${nodes.map((n) => n.id).sort().join(',')}::${edges.map((e) => `${e.source}>${e.target}`).sort().join(',')}`,
    [nodes, edges]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on layoutKey, not nodes/edges references
  const positions = useMemo(() => computeLayout(nodes.map((n) => n.id), edges), [layoutKey]);

  // "Highlight connected nodes / dim unrelated" — a single selected node highlights itself plus
  // its direct neighbors; two selected nodes (compare mode) highlight just those two.
  const highlightSet = useMemo(() => {
    if (selectedNodeIds.length === 0) return null;
    if (selectedNodeIds.length === 1) {
      const id = selectedNodeIds[0];
      if (id === undefined) return null;
      const set = new Set<string>([id]);
      edges.forEach((e) => {
        if (e.source === id) set.add(e.target);
        if (e.target === id) set.add(e.source);
      });
      return set;
    }
    return new Set<string>(selectedNodeIds);
  }, [selectedNodeIds, edges]);

  const computedNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'entity',
        position: positions[n.id] || { x: 0, y: 0 },
        selected: selectedNodeIds.includes(n.id),
        data: {
          label: n.canonicalName,
          entityType: n.entityType,
          confidence: n.confidence,
          confidenceBand: n.confidenceBand,
          status: n.status,
          dimmed: highlightSet ? !highlightSet.has(n.id) : false
        } satisfies EntityNodeData
      })),
    [nodes, positions, selectedNodeIds, highlightSet]
  );

  const computedEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const dimmed = highlightSet ? !(highlightSet.has(e.source) && highlightSet.has(e.target)) : false;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.relationshipType.replace(/_/g, ' ').toLowerCase(),
          className: dimmed ? 'opacity-20' : 'opacity-100',
          style: { stroke: 'var(--border)', strokeWidth: 1.5 },
          labelStyle: { fill: 'var(--muted-foreground)', fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.85 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--border)' }
        };
      }),
    [edges, highlightSet]
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(computedEdges);

  useEffect(() => {
    setRfNodes(computedNodes);
  }, [computedNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(computedEdges);
  }, [computedEdges, setRfEdges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(event, node) => onNodeClick(node.id, event.shiftKey)}
      onPaneClick={() => onPaneClick?.()}
      fitView
      minZoom={0.15}
    >
      <Background color="var(--border)" gap={18} size={1} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => {
          const entityType = (node.data as EntityNodeData | undefined)?.entityType;
          const variant = (entityType && ENTITY_TYPE_BADGE_VARIANT[entityType]) || 'neutral';
          return MINIMAP_VARIANT_COLOR[variant];
        }}
      />
    </ReactFlow>
  );
}
