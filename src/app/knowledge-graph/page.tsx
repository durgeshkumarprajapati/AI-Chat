'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';

export default function KnowledgeGraphDashboard() {
  const [activeTab, setActiveTab] = useState<'graph' | 'entities' | 'relationships' | 'conflicts' | 'gaps'>('graph');
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

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

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <div data-tour="knowledge-graph-header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🌐</span>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Knowledge Graph</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                Phase 41
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Structured entity-relationship network automatically extracted from document evidence.
            </p>
          </div>

          <div data-tour="knowledge-graph-actions" className="flex items-center space-x-3">
            <div data-tour="knowledge-graph-search" className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Search concepts or entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchGraph()}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={fetchGraph}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-md shadow-indigo-600/20"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2">
          {[
            { id: 'graph', label: 'Graph Explorer', icon: '🕸️', tour: 'knowledge-graph-explorer' },
            { id: 'entities', label: `Entities (${nodes.length})`, icon: '🏷️', tour: 'knowledge-graph-entities' },
            { id: 'relationships', label: `Relationships (${edges.length})`, icon: '🔗', tour: 'knowledge-graph-relationships' },
            { id: 'conflicts', label: `Conflicts (${conflicts.length})`, icon: '⚠️', tour: 'knowledge-graph-conflicts' },
            { id: 'gaps', label: `Knowledge Gaps (${gaps.length})`, icon: '🧩', tour: 'knowledge-graph-gaps' }
          ].map((tab) => (
            <button
              key={tab.id}
              data-tour={tab.tour}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : activeTab === 'graph' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div data-tour="knowledge-graph-explorer" className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 min-h-[450px] relative overflow-hidden flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Interactive Graph View (Bounded to 200 nodes)</span>
                <span>Nodes: {nodes.length} | Edges: {edges.length}</span>
              </div>

              {/* Bounded Interactive Canvas Visualization Stub */}
              {nodes.length === 0 ? (
                <div className="my-auto text-center space-y-2 p-8">
                  <span className="text-3xl">📭</span>
                  <p className="text-slate-400 text-sm font-medium">Your Knowledge Graph is currently empty.</p>
                  <p className="text-slate-500 text-xs">Upload or process a document to extract entities and relationships.</p>
                </div>
              ) : (
                <div className="my-auto flex flex-wrap gap-4 justify-center items-center p-6">
                  {nodes.slice(0, 15).map((node) => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`p-3 rounded-xl border text-left transition transform hover:scale-105 ${
                        selectedNode?.id === node.id
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30'
                          : 'bg-slate-950/80 text-slate-200 border-slate-800 hover:border-indigo-500/50'
                      }`}
                    >
                      <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">{node.entityType}</div>
                      <div className="font-bold text-sm">{node.canonicalName}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Conf: {(node.confidence * 100).toFixed(0)}%</div>
                    </button>
                  ))}
                </div>
              )}

              <div className="text-center text-xs text-slate-500">
                Click any concept node to view entity details and evidence citations.
              </div>
            </div>

            {/* Selected Node Sidebar */}
            <div data-tour="knowledge-graph-entity-details" className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="font-bold text-lg text-white">Entity Details</h2>
              {selectedNode ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Name</span>
                    <p className="font-bold text-indigo-400 text-base">{selectedNode.canonicalName}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Type</span>
                    <p className="text-slate-200">{selectedNode.entityType}</p>
                  </div>
                  {selectedNode.description && (
                    <div>
                      <span className="text-xs text-slate-400 uppercase font-semibold">Description</span>
                      <p className="text-slate-300 text-xs mt-0.5">{selectedNode.description}</p>
                    </div>
                  )}
                  <div data-tour="knowledge-graph-evidence">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Extraction Confidence</span>
                    <p className="text-emerald-400 font-mono">{(selectedNode.confidence * 100).toFixed(1)}%</p>
                  </div>
                  <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
                    <a
                      href={`/knowledge-graph/${selectedNode.id}`}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-center font-medium text-xs transition"
                    >
                      View Full Entity Page →
                    </a>
                  </div>
                </div>
              ) : (
                <div data-tour="knowledge-graph-evidence" className="text-slate-500 text-sm">
                  Select an entity node from the graph to inspect evidence and relationships.
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'conflicts' ? (
          <div data-tour="knowledge-graph-conflicts" className="space-y-4">
            {conflicts.length === 0 ? (
              <p className="text-slate-400 text-sm">No knowledge conflicts detected across uploaded document evidence.</p>
            ) : (
              conflicts.map((c) => (
                <div key={c.id} className="p-4 bg-slate-900 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs text-amber-400 font-semibold">
                    <span>⚠️ Conflict: {c.conflictType}</span>
                    <span>Status: {c.status}</span>
                  </div>
                  <p className="text-slate-300 text-sm">Contradictory values detected across document evidence.</p>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'gaps' ? (
          <div data-tour="knowledge-graph-gaps" className="space-y-4">
            {gaps.length === 0 ? (
              <p className="text-slate-400 text-sm">No knowledge gaps detected.</p>
            ) : (
              gaps.map((g, idx) => (
                <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-indigo-400">{g.entityName || 'General Gap'}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">{g.priority} PRIORITY</span>
                  </div>
                  <p className="text-slate-300 text-sm">{g.description}</p>
                </div>
              ))
            )}
          </div>
        ) : (
          <div data-tour="knowledge-graph-entities" className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm">Showing {nodes.length} entities and {edges.length} relationships.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
