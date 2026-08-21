'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function KnowledgeGraphDashboard() {
  const [activeTab, setActiveTab] = useState<'graph' | 'entities' | 'relationships' | 'conflicts' | 'gaps'>('graph');
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    fetchGraph();
    fetchConflicts();
    fetchGaps();
  }, []);

  async function fetchGraph() {
    try {
      setLoading(true);
      const res = await fetch(`/api/knowledge-graph?q=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch (err) {
      console.error('Failed to fetch graph data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchConflicts() {
    try {
      const res = await fetch('/api/knowledge-graph/conflicts');
      const json = await res.json();
      if (json.success) setConflicts(json.data || []);
    } catch (err) {
      console.error('Failed to fetch conflicts:', err);
    }
  }

  async function fetchGaps() {
    try {
      const res = await fetch('/api/knowledge-graph/gaps');
      const json = await res.json();
      if (json.success) setGaps(json.data || []);
    } catch (err) {
      console.error('Failed to fetch gaps:', err);
    }
  }

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.15, 1.6));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.15, 0.6));
  const handleResetZoom = () => setZoomScale(1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto w-full font-sans selection:bg-[#4d8eff] selection:text-[#0a0e18]">
        {/* Enterprise Page Header */}
        <div
          data-tour="knowledge-graph-header"
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-[#0a0e18]/90 border border-[#424754]/60 rounded-2xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden"
        >
          {/* Subtle Ambient Header Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#4d8eff]/10 blur-[100px] pointer-events-none rounded-full" />

          <div className="space-y-1.5 relative z-10">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4d8eff]/20 to-[#adc6ff]/10 border border-[#4d8eff]/40 flex items-center justify-center text-xl shadow-lg shadow-[#4d8eff]/10">
                🌐
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#dfe2f1] tracking-tight">
                  AI Knowledge Graph
                </h1>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
                  <span className="text-[11px] font-mono text-[#adc6ff] uppercase tracking-wider font-bold">
                    Grounded Entity-Relationship Network
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#c2c6d6] max-w-2xl leading-relaxed pl-13">
              Structured entity-relationship network automatically extracted from document evidence with multi-hop reasoning.
            </p>
          </div>

          <div data-tour="knowledge-graph-actions" className="flex items-center space-x-3 relative z-10 shrink-0">
            <div data-tour="knowledge-graph-search" className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <input
                  type="text"
                  placeholder="Search concepts or entities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchGraph()}
                  className="w-full bg-[#0f131d] border border-[#424754] rounded-xl px-3.5 py-2 pl-9 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] focus:ring-1 focus:ring-[#4d8eff] transition"
                />
                <span className="absolute left-3 top-2.5 text-xs text-[#8c909f]">🔍</span>
              </div>
              <button
                onClick={fetchGraph}
                className="px-4 py-2 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-95 text-[#0a0e18] rounded-xl text-xs font-bold transition shadow-lg shadow-[#4d8eff]/20 active:scale-[0.98] shrink-0"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation Rail */}
        <div className="flex space-x-2 border-b border-[#424754]/60 pb-3 overflow-x-auto">
          {[
            { id: 'graph', label: 'Graph Explorer', icon: '🕸️', count: nodes.length, tour: 'knowledge-graph-explorer' },
            { id: 'entities', label: 'Entities', icon: '🏷️', count: nodes.length, tour: 'knowledge-graph-entities' },
            { id: 'relationships', label: 'Relationships', icon: '🔗', count: edges.length, tour: 'knowledge-graph-relationships' },
            { id: 'conflicts', label: 'Conflicts', icon: '⚠️', count: conflicts.length, tour: 'knowledge-graph-conflicts' },
            { id: 'gaps', label: 'Knowledge Gaps', icon: '🧩', count: gaps.length, tour: 'knowledge-graph-gaps' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={tab.tour}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/40 shadow-md shadow-[#4d8eff]/10 font-bold'
                    : 'text-[#c2c6d6] hover:text-[#dfe2f1] hover:bg-[#171b26] border border-transparent'
                }`}
              >
                <span className="text-sm leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    isActive
                      ? 'bg-[#4d8eff]/25 text-[#dfe2f1] border border-[#4d8eff]/40'
                      : 'bg-[#171b26] text-[#8c909f] border border-[#424754]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Tab Content */}
        {loading ? (
          <div className="bg-[#0a0e18]/80 border border-[#424754] rounded-2xl p-16 flex flex-col items-center justify-center space-y-4 min-h-[480px]">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-[#4d8eff]/20 border-t-[#4d8eff] animate-spin" />
              <div className="w-10 h-10 rounded-full border-2 border-[#4edea3]/20 border-b-[#4edea3] animate-spin absolute" />
              <span className="text-xl absolute">🕸️</span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-[#dfe2f1]">Extracting Graph Network...</p>
              <p className="text-xs text-[#8c909f] font-mono">Querying grounded entities & document citations</p>
            </div>
          </div>
        ) : activeTab === 'graph' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Interactive Graph Canvas */}
            <div
              data-tour="knowledge-graph-explorer"
              className="lg:col-span-8 bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 min-h-[520px] relative overflow-hidden flex flex-col justify-between shadow-2xl backdrop-blur-md group"
            >
              {/* Technical Radial Grid Background */}
              <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
              <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-[#4d8eff]/10 blur-[120px] pointer-events-none rounded-full" />
              <div className="absolute bottom-10 right-10 w-64 h-64 bg-[#4edea3]/10 blur-[100px] pointer-events-none rounded-full" />

              {/* Canvas HUD Status Top Bar */}
              <div className="flex justify-between items-center text-[11px] font-mono text-[#c2c6d6] border-b border-[#424754]/50 pb-3 relative z-10">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
                  <span className="font-bold text-[#dfe2f1]">INTERACTIVE GRAPH CANVAS</span>
                  <span className="text-[#8c909f]">(BOUNDED 200 NODES)</span>
                </div>
                <div className="flex items-center space-x-3 text-[10px] uppercase font-bold text-[#adc6ff]">
                  <span>NODES: {nodes.length}</span>
                  <span className="text-[#424754]">|</span>
                  <span>EDGES: {edges.length}</span>
                </div>
              </div>

              {/* Floating Graph Controls Rail */}
              <div className="absolute bottom-6 left-6 z-20 flex flex-col space-y-1.5 bg-[#0f131d]/90 backdrop-blur-md border border-[#424754] rounded-xl p-1.5 shadow-xl">
                <button
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="w-7 h-7 rounded-lg bg-[#171b26] hover:bg-[#262a35] text-[#dfe2f1] font-bold text-xs flex items-center justify-center border border-[#424754] transition"
                >
                  +
                </button>
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="w-7 h-7 rounded-lg bg-[#171b26] hover:bg-[#262a35] text-[#dfe2f1] font-bold text-xs flex items-center justify-center border border-[#424754] transition"
                >
                  −
                </button>
                <button
                  onClick={handleResetZoom}
                  title="Fit to Screen"
                  className="w-7 h-7 rounded-lg bg-[#171b26] hover:bg-[#262a35] text-[#adc6ff] text-xs flex items-center justify-center border border-[#424754] transition"
                >
                  ⛶
                </button>
              </div>

              {/* Graph Nodes Canvas Representation */}
              {nodes.length === 0 ? (
                <div className="my-auto text-center space-y-3 p-10 relative z-10 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full bg-[#171b26] border border-[#424754] flex items-center justify-center text-3xl mx-auto shadow-inner">
                    📭
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-bold text-[#dfe2f1]">Your Knowledge Graph is currently empty</p>
                    <p className="text-xs text-[#c2c6d6] leading-relaxed">
                      Upload or process a document in Project Workspaces to extract entities and relationships automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="my-auto flex flex-wrap gap-3.5 justify-center items-center p-6 relative z-10 transition-transform duration-200"
                  style={{ transform: `scale(${zoomScale})` }}
                >
                  {nodes.slice(0, 20).map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`p-3.5 rounded-2xl border text-left transition-all transform hover:scale-[1.04] active:scale-[0.98] ${
                          isSelected
                            ? 'bg-[#4d8eff]/20 text-[#dfe2f1] border-[#4d8eff] shadow-xl shadow-[#4d8eff]/20 ring-1 ring-[#4d8eff]'
                            : 'bg-[#0f131d]/90 text-[#dfe2f1] border-[#424754] hover:border-[#4d8eff]/60 hover:bg-[#171b26]'
                        }`}
                      >
                        <div className="flex items-center justify-between space-x-3 mb-1">
                          <span className="text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-wider bg-[#4d8eff]/10 px-2 py-0.5 rounded border border-[#4d8eff]/20">
                            {node.entityType}
                          </span>
                          <span className="text-[10px] font-mono text-[#4edea3] font-bold">
                            {(node.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="font-bold text-xs text-[#dfe2f1] truncate max-w-[140px]">
                          {node.canonicalName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bottom Guidance Prompt */}
              <div className="text-center text-[11px] font-mono text-[#c2c6d6] border-t border-[#424754]/40 pt-3 relative z-10">
                Click any concept node to inspect entity details, relationships, and evidence citations.
              </div>
            </div>

            {/* Selected Node Right Context Panel */}
            <div
              data-tour="knowledge-graph-entity-details"
              className="lg:col-span-4 bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 space-y-5 shadow-2xl backdrop-blur-md relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">ℹ️</span>
                  <h2 className="font-extrabold text-base text-[#dfe2f1]">Entity Details</h2>
                </div>
                {selectedNode && (
                  <span className="text-[10px] font-mono text-[#4d8eff] bg-[#4d8eff]/10 px-2 py-0.5 rounded border border-[#4d8eff]/30 font-bold uppercase">
                    SELECTED
                  </span>
                )}
              </div>

              {selectedNode ? (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-[#0f131d] border border-[#424754] space-y-1">
                    <span className="text-[10px] font-mono text-[#c2c6d6] uppercase font-bold tracking-wider">
                      Canonical Name
                    </span>
                    <p className="font-extrabold text-base text-[#adc6ff]">{selectedNode.canonicalName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#0f131d] border border-[#424754]">
                      <span className="text-[10px] font-mono text-[#c2c6d6] uppercase font-bold tracking-wider">
                        Entity Type
                      </span>
                      <p className="text-xs font-bold text-[#dfe2f1] mt-0.5">{selectedNode.entityType}</p>
                    </div>

                    <div data-tour="knowledge-graph-evidence" className="p-3 rounded-xl bg-[#0f131d] border border-[#424754]">
                      <span className="text-[10px] font-mono text-[#c2c6d6] uppercase font-bold tracking-wider">
                        Confidence
                      </span>
                      <p className="text-xs font-mono font-bold text-[#4edea3] mt-0.5">
                        {(selectedNode.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {selectedNode.description && (
                    <div className="p-3.5 rounded-xl bg-[#0f131d] border border-[#424754] space-y-1">
                      <span className="text-[10px] font-mono text-[#c2c6d6] uppercase font-bold tracking-wider">
                        Description
                      </span>
                      <p className="text-xs text-[#c2c6d6] leading-relaxed">{selectedNode.description}</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link
                      href={`/knowledge-graph/${selectedNode.id}`}
                      className="w-full py-2.5 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-95 text-[#0a0e18] rounded-xl text-center font-extrabold text-xs transition shadow-lg shadow-[#4d8eff]/20 block"
                    >
                      View Full Entity Page →
                    </Link>
                  </div>
                </div>
              ) : (
                <div data-tour="knowledge-graph-evidence" className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#171b26] border border-[#424754] flex items-center justify-center text-xl mx-auto">
                    👉
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#dfe2f1]">No Entity Selected</p>
                    <p className="text-[11px] text-[#c2c6d6] max-w-xs mx-auto">
                      Select any concept node from the interactive graph view to inspect extraction evidence and graph relationships.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'conflicts' ? (
          <div data-tour="knowledge-graph-conflicts" className="space-y-4">
            {conflicts.length === 0 ? (
              <div className="bg-[#0a0e18]/80 border border-[#424754] rounded-2xl p-10 text-center space-y-2">
                <span className="text-2xl">✅</span>
                <p className="text-sm font-bold text-[#dfe2f1]">No Conflicts Detected</p>
                <p className="text-xs text-[#c2c6d6]">No contradictory values found across document evidence.</p>
              </div>
            ) : (
              conflicts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 bg-[#0a0e18]/90 border border-[#ffb95f]/40 rounded-2xl space-y-2 shadow-lg backdrop-blur-md"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#ffb95f] flex items-center space-x-1.5">
                      <span>⚠️</span>
                      <span>Conflict: {c.conflictType}</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ffb95f]/10 text-[#ffb95f] border border-[#ffb95f]/30 font-bold uppercase">
                      Status: {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#c2c6d6] leading-relaxed">Contradictory values detected across document evidence.</p>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'gaps' ? (
          <div data-tour="knowledge-graph-gaps" className="space-y-4">
            {gaps.length === 0 ? (
              <div className="bg-[#0a0e18]/80 border border-[#424754] rounded-2xl p-10 text-center space-y-2">
                <span className="text-2xl">🧩</span>
                <p className="text-sm font-bold text-[#dfe2f1]">No Knowledge Gaps Detected</p>
                <p className="text-xs text-[#c2c6d6]">All concepts have sufficient grounded document coverage.</p>
              </div>
            ) : (
              gaps.map((g, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-[#0a0e18]/90 border border-[#424754] rounded-2xl space-y-2 shadow-lg backdrop-blur-md"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-[#adc6ff]">{g.entityName || 'General Knowledge Gap'}</span>
                    <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#4d8eff]/10 text-[#adc6ff] border border-[#4d8eff]/30 font-bold uppercase">
                      {g.priority} PRIORITY
                    </span>
                  </div>
                  <p className="text-xs text-[#c2c6d6] leading-relaxed">{g.description}</p>
                </div>
              ))
            )}
          </div>
        ) : (
          <div data-tour="knowledge-graph-entities" className="bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 space-y-4 shadow-2xl backdrop-blur-md">
            <div className="flex justify-between items-center border-b border-[#424754]/60 pb-3">
              <span className="text-xs font-mono font-bold text-[#adc6ff] uppercase tracking-wider">
                Graph Network Registry
              </span>
              <span className="text-xs font-mono text-[#c2c6d6]">
                {nodes.length} Entities | {edges.length} Relationships
              </span>
            </div>

            {nodes.length === 0 ? (
              <p className="text-xs text-[#c2c6d6] text-center py-6">No entity entries registered in graph index.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {nodes.map((n) => (
                  <div key={n.id} className="p-3.5 rounded-xl bg-[#0f131d] border border-[#424754] space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-[#adc6ff] font-bold uppercase">{n.entityType}</span>
                      <span className="text-[#4edea3]">{(n.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="font-bold text-xs text-[#dfe2f1] truncate">{n.canonicalName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
  );
}
