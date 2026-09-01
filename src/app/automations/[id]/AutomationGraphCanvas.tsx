'use client';

// Phase 88 Part A — split out of page.tsx so @xyflow/react — the largest client dependency in
// this codebase — loads as its own async chunk via next/dynamic in the parent page, instead of
// shipping in every other page's initial JS. Same convention as
// src/app/developer/architecture/ArchitectureGraphCanvas.tsx and
// src/app/knowledge-graph/explorer/ExplorerGraphCanvas.tsx (the latter is the pattern this file
// follows: a custom Tailwind-token-based node component, not inline hex styles).
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
  type NodeProps,
  type Connection
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/Badge';
import { TRANSITION } from '@/lib/design-system/theme.constants';
import {
  NODE_TYPE_BADGE_VARIANT,
  NODE_TYPE_ICON,
  NODE_TYPE_LABEL,
  type AutomationEdgeDTO,
  type AutomationNodeDTO,
  type AutomationNodeType
} from '../automation.types';
import type { BadgeVariant } from '@/components/ui/Badge';

interface AutomationNodeData extends Record<string, unknown> {
  key: string;
  type: AutomationNodeType;
  errors: string[];
  isEntry: boolean;
  isTerminal: boolean;
}

/** Custom ReactFlow node — Tailwind classes driven by NODE_TYPE_BADGE_VARIANT (see
 * automation.types.ts for the exact mapping + rationale), not inline hex, per the Phase 84
 * Explorer's established pattern (this repo's more recent React Flow reference vs. the older
 * inline-hex architecture page). */
function AutomationFlowNode({ data, selected }: NodeProps) {
  const d = data as AutomationNodeData;
  const badgeVariant: BadgeVariant = NODE_TYPE_BADGE_VARIANT[d.type];
  const hasErrors = d.errors.length > 0;

  return (
    <div
      className={`min-w-[176px] max-w-[230px] rounded-xl border px-3 py-2.5 shadow-sm bg-card ${TRANSITION.base} ${
        selected ? 'ring-2 ring-primary border-primary shadow-md' : hasErrors ? 'border-destructive/60' : 'border-card-border'
      } ${d.isEntry ? 'border-l-4 !border-l-primary bg-primary/5' : ''} ${d.isTerminal ? 'border-dashed opacity-90' : ''}`}
      title={hasErrors ? d.errors.join('; ') : undefined}
    >
      {!d.isEntry && <Handle type="target" position={Position.Top} className="!bg-border !border-0 !w-2 !h-2" />}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <Badge variant={badgeVariant} className="truncate">
          {NODE_TYPE_ICON[d.type]} {NODE_TYPE_LABEL[d.type]}
        </Badge>
        {hasErrors && (
          <span className="text-destructive text-xs" aria-label={`${d.errors.length} validation error(s)`}>
            ⚠
          </span>
        )}
      </div>
      <p className="text-[11px] font-mono text-muted-foreground leading-snug break-words line-clamp-1" title={d.key}>
        {d.key}
      </p>
      {!d.isTerminal && <Handle type="source" position={Position.Bottom} className="!bg-border !border-0 !w-2 !h-2" />}
    </div>
  );
}

const nodeTypes: NodeTypes = Object.fromEntries(
  (['TRIGGER', 'CONDITION', 'AI_ANALYSIS', 'AI_AGENT', 'APPROVAL', 'CLICKUP_ACTION', 'CALENDAR_ACTION', 'NOTIFICATION', 'DELAY', 'END'] as AutomationNodeType[]).map(
    (t) => [t, AutomationFlowNode]
  )
) as NodeTypes;

/** Badge-variant -> CSS custom property, for MiniMap's `nodeColor` prop — the one ReactFlow prop
 * that only accepts a resolved CSS color value, not a Tailwind class. Same narrow exception the
 * reference architecture + explorer pages document. */
const MINIMAP_VARIANT_COLOR: Record<BadgeVariant, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  neutral: 'var(--muted-foreground)'
};

export interface AutomationGraphCanvasProps {
  nodes: AutomationNodeDTO[];
  edges: AutomationEdgeDTO[];
  selectedNodeKey: string | null;
  selectedEdgeId: string | null;
  errorsByNode: Record<string, string[]>;
  readOnly: boolean;
  onNodePositionChange: (_nodeKey: string, _position: { x: number; y: number }) => void;
  onSelectNode: (_nodeKey: string) => void;
  onSelectEdge: (_edgeId: string) => void;
  onClearSelection: () => void;
  onConnect: (_sourceKey: string, _targetKey: string) => void;
  onDeleteNode: (_nodeKey: string) => void;
  onDeleteEdge: (_edgeId: string) => void;
}

export default function AutomationGraphCanvas({
  nodes,
  edges,
  selectedNodeKey,
  selectedEdgeId,
  errorsByNode,
  readOnly,
  onNodePositionChange,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onConnect,
  onDeleteNode,
  onDeleteEdge
}: AutomationGraphCanvasProps) {
  const computedNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.key,
        type: n.type,
        position: n.position,
        selected: selectedNodeKey === n.key,
        data: {
          key: n.key,
          type: n.type,
          errors: errorsByNode[n.key] || [],
          isEntry: n.type === 'TRIGGER',
          isTerminal: n.type === 'END'
        } satisfies AutomationNodeData
      })),
    [nodes, selectedNodeKey, errorsByNode]
  );

  const computedEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        selected: selectedEdgeId === e.id,
        label: e.condition ? `${e.condition.path} ${e.condition.op} ${String(e.condition.value)}` : undefined,
        style: { stroke: selectedEdgeId === e.id ? 'var(--primary)' : 'var(--border)', strokeWidth: selectedEdgeId === e.id ? 2.5 : 1.5 },
        labelStyle: { fill: 'var(--muted-foreground)', fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--border)' }
      })),
    [edges, selectedEdgeId]
  );

  const [rfNodes, setRfNodes, onNodesChangeInternal] = useNodesState<Node>(computedNodes);
  const [rfEdges, setRfEdges, onEdgesChangeInternal] = useEdgesState<Edge>(computedEdges);

  useEffect(() => {
    setRfNodes(computedNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync whenever the parent's authoritative definition changes
  }, [computedNodes]);

  useEffect(() => {
    setRfEdges(computedEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync whenever the parent's authoritative definition changes
  }, [computedEdges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      onNodesChange={(changes) => {
        onNodesChangeInternal(changes);
        if (readOnly) return;
        for (const change of changes) {
          if (change.type === 'position' && change.position && change.dragging === false) {
            onNodePositionChange(change.id, change.position);
          }
          if (change.type === 'remove') {
            onDeleteNode(change.id);
          }
        }
      }}
      onEdgesChange={(changes) => {
        if (readOnly) {
          // Still let ReactFlow apply pure-selection changes so clicking an edge highlights it.
          onEdgesChangeInternal(changes.filter((c) => c.type === 'select'));
          return;
        }
        onEdgesChangeInternal(changes);
        for (const change of changes) {
          if (change.type === 'remove') onDeleteEdge(change.id);
        }
      }}
      onConnect={(connection: Connection) => {
        if (readOnly || !connection.source || !connection.target) return;
        onConnect(connection.source, connection.target);
      }}
      onNodeClick={(_event, node) => onSelectNode(node.id)}
      onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => onClearSelection()}
      deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
      fitView
      minZoom={0.2}
    >
      <Background color="var(--border)" gap={18} size={1} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => {
          const type = (node.data as AutomationNodeData | undefined)?.type;
          const variant = (type && NODE_TYPE_BADGE_VARIANT[type]) || 'neutral';
          return MINIMAP_VARIANT_COLOR[variant];
        }}
      />
    </ReactFlow>
  );
}
