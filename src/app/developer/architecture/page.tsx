'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Node } from '@xyflow/react';
import { useTheme } from '@/context/ThemeContext';

// Phase 77: @xyflow/react (the largest client-side dependency in this codebase) now loads as
// its own async chunk instead of being bundled into this page's initial JS. `ssr: false`
// because ReactFlow requires browser APIs; this page was already 100% client-rendered
// ('use client' above), so this changes nothing about when/whether the graph is interactive —
// only whether its JS ships in the initial page bundle.
const ArchitectureGraphCanvas = dynamic(() => import('./ArchitectureGraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground animate-pulse">
      Loading interactive architecture graph...
    </div>
  )
});

type SystemNodeData = {
  label: string;
  category: string;
  description: string;
  status: string;
  techStack?: string;
  featureFlag?: string;
};

export default function ArchitectureExplorerPage() {
  // Phase 77A: this page previously had its own `useState(true)` "isDarkMode" toggle,
  // completely disconnected from the app's real theme (ThemeContext) — it always defaulted to
  // dark regardless of the user's actual site-wide preference, and offered a second, redundant
  // toggle button. Now it reads the real resolved theme, so it follows the same light/dark
  // switch as every other page instead of maintaining its own shadow state.
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<SystemNodeData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGraphData = useCallback(async () => {
    try {
      const res = await fetch('/api/developer/architecture');
      const json = await res.json();
      if (json.success) {
        const rawNodes = json.data.nodes || [];
        const rawEdges = json.data.edges || [];

        // ReactFlow node/edge `style` is plain inline CSS on the rendered graph nodes, not
        // Tailwind-classed DOM — it genuinely needs a resolved JS color value here, sourced
        // from the real theme rather than a hardcoded/fake one.
        const flowNodes: Node[] = rawNodes.map((n: any) => ({
          id: n.id,
          position: n.position || { x: 100, y: 100 },
          data: {
            label: n.name,
            category: n.category,
            description: n.description,
            status: n.status,
            techStack: n.techStack,
            featureFlag: n.featureFlag
          },
          style: {
            background: isDarkMode ? '#0f172a' : '#ffffff',
            color: isDarkMode ? '#f8fafc' : '#0f172a',
            border: `1.5px solid ${n.status === 'ENABLED' || n.status === 'CONFIGURED' ? '#6366f1' : '#64748b'}`,
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '12px',
            fontWeight: 600,
            width: 220
          }
        }));

        const flowEdges = rawEdges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: e.animated || false,
          style: { stroke: isDarkMode ? '#475569' : '#94a3b8', strokeWidth: 1.5 }
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
      }
    } catch (err) {
      console.error('Failed to load architecture graph:', err);
    } finally {
      setLoading(false);
    }
  }, [isDarkMode, setNodes, setEdges]);

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  const onNodeSelect = (node: Node) => {
    setSelectedNode(node.data as unknown as SystemNodeData);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-4">
      {/* Top Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 rounded-2xl border border-border bg-surface shadow-xl">
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            🏗️ Live System Architecture Explorer
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Interactive visualization of active codebase modules, RAG pipelines, LLM gateways, and database infrastructure.
          </p>
        </div>
      </div>

      {/* Main Canvas & Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[60dvh] sm:h-[500px] lg:h-[720px]">
        {/* React Flow Graph Canvas */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-surface/90 overflow-hidden relative shadow-2xl">
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground animate-pulse">
              Loading interactive architecture graph...
            </div>
          ) : (
            <ArchitectureGraphCanvas
              initialNodes={nodes}
              initialEdges={edges}
              isDarkMode={isDarkMode}
              onNodeSelect={onNodeSelect}
            />
          )}
        </div>

        {/* Node Inspector Panel */}
        <div className="p-5 rounded-2xl border border-border bg-surface space-y-4 shadow-xl overflow-y-auto">
          <h3 className="font-bold text-sm border-b border-border pb-3 text-foreground">🔍 Node Inspector</h3>

          {selectedNode ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-primary block mb-1">
                  {selectedNode.category}
                </span>
                <h4 className="text-base font-extrabold text-foreground">{selectedNode.label}</h4>
              </div>

              <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                <span className="text-[10px] text-muted-foreground block font-semibold">Purpose & Scope</span>
                <p className="leading-relaxed text-foreground">{selectedNode.description}</p>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-muted border border-border">
                <span className="text-muted-foreground">Status</span>
                <span className="font-bold text-success">{selectedNode.status}</span>
              </div>

              {selectedNode.techStack && (
                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] text-muted-foreground block font-semibold">Tech Stack</span>
                  <p className="font-mono text-primary">{selectedNode.techStack}</p>
                </div>
              )}

              {selectedNode.featureFlag && (
                <div className="p-3 rounded-xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] text-muted-foreground block font-semibold">Feature Flag</span>
                  <p className="font-mono text-accent-foreground">{selectedNode.featureFlag}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
              <span className="text-2xl block">👆</span>
              <p>Click on any architecture node in the graph to inspect detailed module properties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
