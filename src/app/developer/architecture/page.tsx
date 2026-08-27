'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Node } from '@xyflow/react';

// Phase 77: @xyflow/react (the largest client-side dependency in this codebase) now loads as
// its own async chunk instead of being bundled into this page's initial JS. `ssr: false`
// because ReactFlow requires browser APIs; this page was already 100% client-rendered
// ('use client' above), so this changes nothing about when/whether the graph is interactive —
// only whether its JS ships in the initial page bundle.
const ArchitectureGraphCanvas = dynamic(() => import('./ArchitectureGraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-xs text-slate-500 animate-pulse">
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
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<SystemNodeData | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchGraphData = useCallback(async () => {
    try {
      const res = await fetch('/api/developer/architecture');
      const json = await res.json();
      if (json.success) {
        const rawNodes = json.data.nodes || [];
        const rawEdges = json.data.edges || [];

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
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} p-6 space-y-4`}>
      {/* Top Controls Header */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between p-5 rounded-2xl border shadow-xl ${
        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            🏗️ Live System Architecture Explorer
          </h1>
          <p className="text-xs opacity-70 mt-0.5">
            Interactive visualization of active codebase modules, RAG pipelines, LLM gateways, and database infrastructure.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}
          >
            {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>
      </div>

      {/* Main Canvas & Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[720px]">
        {/* React Flow Graph Canvas */}
        <div className={`lg:col-span-3 rounded-2xl border overflow-hidden relative shadow-2xl ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-500 animate-pulse">
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
        <div className={`p-5 rounded-2xl border space-y-4 shadow-xl overflow-y-auto ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className="font-bold text-sm border-b pb-3 opacity-90">🔍 Node Inspector</h3>

          {selectedNode ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 block mb-1">
                  {selectedNode.category}
                </span>
                <h4 className="text-base font-extrabold">{selectedNode.label}</h4>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1">
                <span className="text-[10px] opacity-60 block font-semibold">Purpose & Scope</span>
                <p className="leading-relaxed opacity-90">{selectedNode.description}</p>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950/40 border border-slate-800/80">
                <span className="opacity-60">Status</span>
                <span className="font-bold text-emerald-400">{selectedNode.status}</span>
              </div>

              {selectedNode.techStack && (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] opacity-60 block font-semibold">Tech Stack</span>
                  <p className="font-mono text-indigo-300">{selectedNode.techStack}</p>
                </div>
              )}

              {selectedNode.featureFlag && (
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1">
                  <span className="text-[10px] opacity-60 block font-semibold">Feature Flag</span>
                  <p className="font-mono text-purple-300">{selectedNode.featureFlag}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs opacity-50 space-y-2">
              <span className="text-2xl block">👆</span>
              <p>Click on any architecture node in the graph to inspect detailed module properties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
