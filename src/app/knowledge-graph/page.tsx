'use client';

import React, { useState, useEffect, useCallback } from 'react';

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

  // Status & Backfill State
  const [graphStatus, setGraphStatus] = useState<{
    entitiesCount: number;
    relationshipsCount: number;
    completedDocsCount: number;
    pendingJobsCount: number;
    hasGraphData: boolean;
    isExtracting: boolean;
  } | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-graph/status');
      const json = await res.json();
      if (json.success && json.data) {
        setGraphStatus(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch graph status:', err);
    }
  }, []);

  const fetchGraph = useCallback(async () => {
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
    } fontally: {
      setLoading(false);
    }
  }, [searchQuery]);

  const fetchConflicts = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-graph/conflicts');
      const json = await res.json();
      if (json.success) setConflicts(json.data || []);
    } catch (err) {
      console.error('Failed to fetch conflicts:', err);
    }
  }, []);

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-graph/gaps');
      const json = await res.json();
      if (json.success) setGaps(json.data || []);
    } catch (err) {
      console.error('Failed to fetch gaps:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchGraph();
    fetchConflicts();
    fetchGaps();
  }, [fetchStatus, fetchGraph, fetchConflicts, fetchGaps]);

  // Poll status when extraction is running
  useEffect(() => {
    if (!graphStatus?.isExtracting) return;

    const timer = setInterval(() => {
      fetchStatus();
      fetchGraph();
    }, 4000);

    return () => clearInterval(timer);
  }, [graphStatus?.isExtracting, fetchStatus, fetchGraph]);

  const handleTriggerBackfill = async () => {
    setIsBackfilling(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/knowledge-graph/backfill', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to start Knowledge Graph extraction');

      setBannerMessage({
        type: 'success',
        text: json.message || 'Queued Knowledge Graph extraction jobs in background.'
      });
      fetchStatus();
      fetchGraph();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to trigger Knowledge Graph extraction.'
      });
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.15, 1.6));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.15, 0.6));
  const handleResetZoom = () => setZoomScale(1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto w-full font-sans selection:bg-[#4d8eff] selection:text-white text-slate-900 dark:text-[#dfe2f1]">
      {/* Banner Alert Message */}
      {bannerMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button onClick={() => setBannerMessage(null)} className="hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      {/* Enterprise Page Header */}
      <div
        data-tour="knowledge-graph-header"
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-white dark:bg-[#0a0e18]/90 border border-slate-200 dark:border-[#424754]/60 rounded-2xl p-6 shadow-sm dark:shadow-xl backdrop-blur-md relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#4d8eff]/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-gradient-to-br dark:from-[#4d8eff]/20 dark:to-[#adc6ff]/10 border border-indigo-200 dark:border-[#4d8eff]/40 flex items-center justify-center text-xl shadow-sm dark:shadow-lg shadow-indigo-600/10">
              🌐
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-[#dfe2f1] tracking-tight">
                AI Knowledge Graph
              </h1>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${graphStatus?.isExtracting ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 dark:bg-[#4edea3]'}`} />
                <span className="text-[11px] font-mono text-indigo-600 dark:text-[#adc6ff] uppercase tracking-wider font-bold">
                  {graphStatus?.isExtracting ? 'Graph Extraction In Progress...' : 'Grounded Entity-Relationship Network'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-[#c2c6d6] max-w-2xl leading-relaxed pl-[3.25rem]">
            Structured entity-relationship network automatically extracted from document evidence with multi-hop reasoning.
          </p>
        </div>

        <div data-tour="knowledge-graph-actions" className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
          {/* Build Graph Action Button */}
          <button
            onClick={handleTriggerBackfill}
            disabled={isBackfilling || graphStatus?.isExtracting}
            className="px-4 py-2 bg-indigo-600 dark:bg-gradient-to-r dark:from-[#4d8eff] dark:to-[#adc6ff] hover:opacity-95 text-white dark:text-[#0a0e18] rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 flex items-center space-x-2"
          >
            <span>{isBackfilling || graphStatus?.isExtracting ? '⏳ Extracting Graph...' : '🕸 Build Knowledge Graph'}</span>
          </button>

          <div data-tour="knowledge-graph-search" className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchGraph()}
                className="w-full bg-slate-50 dark:bg-[#0f131d] border border-slate-300 dark:border-[#424754] rounded-xl px-3.5 py-2 pl-9 text-xs text-slate-900 dark:text-[#dfe2f1] placeholder-slate-400 dark:placeholder-[#8c909f] focus:outline-none focus:border-indigo-600 dark:focus:border-[#4d8eff] focus:ring-1 focus:ring-indigo-600 transition"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 dark:text-[#8c909f]">🔍</span>
            </div>
            <button
              onClick={fetchGraph}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Extraction Status Callout (when documents exist but graph is empty) */}
      {graphStatus && graphStatus.completedDocsCount > 0 && !graphStatus.hasGraphData && !graphStatus.isExtracting && (
        <div className="p-5 bg-indigo-50/80 dark:bg-[#4d8eff]/10 border border-indigo-200 dark:border-[#4d8eff]/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-indigo-900 dark:text-[#adc6ff] flex items-center space-x-2">
              <span>💡</span>
              <span>Ready to Build Knowledge Graph</span>
            </h3>
            <p className="text-xs text-slate-700 dark:text-[#c2c6d6]">
              You have <strong className="font-mono font-bold text-indigo-700 dark:text-white">{graphStatus.completedDocsCount}</strong> completed document(s) ready for graph extraction. Click below to extract entities, relationships, and evidence.
            </p>
          </div>
          <button
            onClick={handleTriggerBackfill}
            disabled={isBackfilling}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 shrink-0"
          >
            {isBackfilling ? 'Queuing Extraction...' : '⚡ Extract Graph From Existing Docs'}
          </button>
        </div>
      )}

      {/* Tab Navigation Rail */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-[#424754]/60 pb-3 overflow-x-auto">
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
                  ? 'bg-indigo-100 dark:bg-[#4d8eff]/15 text-indigo-800 dark:text-[#adc6ff] border border-indigo-300 dark:border-[#4d8eff]/40 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-[#c2c6d6] hover:text-slate-900 dark:hover:text-[#dfe2f1] hover:bg-slate-100 dark:hover:bg-[#171b26] border border-transparent'
              }`}
            >
              <span className="text-sm leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                className={`ml-1 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                  isActive
                    ? 'bg-indigo-200/60 dark:bg-[#4d8eff]/25 text-indigo-900 dark:text-[#dfe2f1] border border-indigo-300 dark:border-[#4d8eff]/40'
                    : 'bg-slate-100 dark:bg-[#171b26] text-slate-600 dark:text-[#8c909f] border border-slate-200 dark:border-[#424754]'
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
        <div className="bg-white dark:bg-[#0a0e18]/80 border border-slate-200 dark:border-[#424754] rounded-2xl p-16 flex flex-col items-center justify-center space-y-4 min-h-[480px]">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-2 border-indigo-300 dark:border-[#4d8eff]/20 border-t-indigo-600 dark:border-t-[#4d8eff] animate-spin" />
            <div className="w-10 h-10 rounded-full border-2 border-emerald-300 dark:border-[#4edea3]/20 border-b-emerald-500 dark:border-b-[#4edea3] animate-spin absolute" />
            <span className="text-xl absolute">🕸️</span>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-slate-900 dark:text-[#dfe2f1]">Querying Knowledge Graph Network...</p>
            <p className="text-xs text-slate-500 dark:text-[#8c909f] font-mono">Retrieving entity nodes and relationship edges</p>
          </div>
        </div>
      ) : activeTab === 'graph' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Interactive Graph Canvas */}
          <div
            data-tour="knowledge-graph-explorer"
            className="lg:col-span-8 bg-white dark:bg-[#0a0e18]/90 border border-slate-200 dark:border-[#424754] rounded-2xl p-6 min-h-[520px] relative overflow-hidden flex flex-col justify-between shadow-sm dark:shadow-2xl backdrop-blur-md group"
          >
            <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
            <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-indigo-500/10 dark:bg-[#4d8eff]/10 blur-[120px] pointer-events-none rounded-full" />
            <div className="absolute bottom-10 right-10 w-64 h-64 bg-emerald-500/10 dark:bg-[#4edea3]/10 blur-[100px] pointer-events-none rounded-full" />

            {/* Canvas HUD Status Top Bar */}
            <div className="flex justify-between items-center text-[11px] font-mono text-slate-600 dark:text-[#c2c6d6] border-b border-slate-200 dark:border-[#424754]/50 pb-3 relative z-10">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${graphStatus?.isExtracting ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 dark:bg-[#4edea3]'}`} />
                <span className="font-bold text-slate-900 dark:text-[#dfe2f1]">INTERACTIVE GRAPH CANVAS</span>
                <span className="text-slate-400 dark:text-[#8c909f]">(BOUNDED 200 NODES)</span>
              </div>
              <div className="flex items-center space-x-3 text-[10px] uppercase font-bold text-indigo-600 dark:text-[#adc6ff]">
                <span>NODES: {nodes.length}</span>
                <span className="text-slate-300 dark:text-[#424754]">|</span>
                <span>EDGES: {edges.length}</span>
              </div>
            </div>

            {/* Floating Graph Controls Rail */}
            <div className="absolute bottom-6 left-6 z-20 flex flex-col space-y-1.5 bg-white/90 dark:bg-[#0f131d]/90 backdrop-blur-md border border-slate-200 dark:border-[#424754] rounded-xl p-1.5 shadow-md">
              <button
                onClick={handleZoomIn}
                title="Zoom In"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#171b26] hover:bg-slate-200 dark:hover:bg-[#262a35] text-slate-900 dark:text-[#dfe2f1] font-bold text-xs flex items-center justify-center border border-slate-300 dark:border-[#424754] transition"
              >
                +
              </button>
              <button
                onClick={handleZoomOut}
                title="Zoom Out"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#171b26] hover:bg-slate-200 dark:hover:bg-[#262a35] text-slate-900 dark:text-[#dfe2f1] font-bold text-xs flex items-center justify-center border border-slate-300 dark:border-[#424754] transition"
              >
                −
              </button>
              <button
                onClick={handleResetZoom}
                title="Fit to Screen"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#171b26] hover:bg-slate-200 dark:hover:bg-[#262a35] text-indigo-600 dark:text-[#adc6ff] text-xs flex items-center justify-center border border-slate-300 dark:border-[#424754] transition"
              >
                ⛶
              </button>
            </div>

            {/* Graph Nodes Canvas Representation */}
            {nodes.length === 0 ? (
              <div className="my-auto text-center space-y-4 p-10 relative z-10 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#171b26] border border-slate-200 dark:border-[#424754] flex items-center justify-center text-3xl mx-auto shadow-inner">
                  {graphStatus?.isExtracting ? '⏳' : '🕸️'}
                </div>

                <div className="space-y-1.5">
                  <p className="text-base font-bold text-slate-900 dark:text-[#dfe2f1]">
                    {graphStatus?.isExtracting
                      ? 'Extracting Graph Entities in Background...'
                      : graphStatus && graphStatus.completedDocsCount > 0
                      ? 'Knowledge Graph Has Not Been Extracted Yet'
                      : 'Your Knowledge Base is Empty'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-[#c2c6d6] leading-relaxed">
                    {graphStatus?.isExtracting
                      ? 'The AI processing worker is actively scanning document chunks and extracting entities and relationships.'
                      : graphStatus && graphStatus.completedDocsCount > 0
                      ? `You have ${graphStatus.completedDocsCount} completed document(s). Click "Build Knowledge Graph" to extract entities and relationships.`
                      : 'Upload a PDF document to start automatic entity and relationship extraction.'}
                  </p>
                </div>

                {graphStatus && graphStatus.completedDocsCount > 0 && !graphStatus.isExtracting && (
                  <button
                    onClick={handleTriggerBackfill}
                    disabled={isBackfilling}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/25"
                  >
                    {isBackfilling ? 'Queuing Extraction...' : '⚡ Build Knowledge Graph Now'}
                  </button>
                )}
              </div>
            ) : (
              <div
                className="my-auto flex flex-wrap gap-3.5 justify-center items-center p-6 relative z-10 transition-transform duration-200"
                style={{ transform: `scale(${zoomScale})` }}
              >
                {nodes.slice(0, 30).map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`p-3.5 rounded-2xl border text-left transition-all transform hover:scale-[1.04] active:scale-[0.98] ${
                        isSelected
                          ? 'bg-indigo-100 dark:bg-[#4d8eff]/20 text-indigo-900 dark:text-[#dfe2f1] border-indigo-600 dark:border-[#4d8eff] shadow-md dark:shadow-xl shadow-indigo-600/10 dark:shadow-[#4d8eff]/20 ring-1 ring-indigo-600 dark:ring-[#4d8eff]'
                          : 'bg-white dark:bg-[#0f131d]/90 text-slate-900 dark:text-[#dfe2f1] border-slate-200 dark:border-[#424754] hover:border-indigo-400 dark:hover:border-[#4d8eff]/60 hover:bg-slate-50 dark:hover:bg-[#171b26]'
                      }`}
                    >
                      <div className="flex items-center justify-between space-x-3 mb-1">
                        <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-[#adc6ff] uppercase tracking-wider bg-indigo-50 dark:bg-[#4d8eff]/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-[#4d8eff]/20">
                          {node.entityType}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-[#4edea3] font-bold">
                          {(node.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-900 dark:text-[#dfe2f1] truncate max-w-[140px]">
                        {node.canonicalName}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Guidance Prompt */}
            <div className="text-center text-[11px] font-mono text-slate-500 dark:text-[#c2c6d6] border-t border-slate-200 dark:border-[#424754]/40 pt-3 relative z-10">
              Click any concept node to inspect entity details, relationships, and evidence citations.
            </div>
          </div>

          {/* Selected Node Right Context Panel */}
          <div
            data-tour="knowledge-graph-entity-details"
            className="lg:col-span-4 bg-white dark:bg-[#0a0e18]/90 border border-slate-200 dark:border-[#424754] rounded-2xl p-6 space-y-5 shadow-sm dark:shadow-2xl backdrop-blur-md relative overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#424754]/60 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm">ℹ️</span>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-[#dfe2f1]">Entity Details</h2>
              </div>
              {selectedNode && (
                <span className="text-[10px] font-mono text-indigo-700 dark:text-[#4d8eff] bg-indigo-50 dark:bg-[#4d8eff]/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-[#4d8eff]/30 font-bold uppercase">
                  SELECTED
                </span>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754] space-y-1">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-[#c2c6d6] uppercase font-bold tracking-wider">
                    Canonical Name
                  </span>
                  <p className="font-extrabold text-base text-indigo-600 dark:text-[#adc6ff]">{selectedNode.canonicalName}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-[#c2c6d6] uppercase font-bold tracking-wider">
                      Entity Type
                    </span>
                    <p className="text-xs font-bold text-slate-900 dark:text-[#dfe2f1] mt-0.5">{selectedNode.entityType}</p>
                  </div>

                  <div data-tour="knowledge-graph-evidence" className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754]">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-[#c2c6d6] uppercase font-bold tracking-wider">
                      Confidence
                    </span>
                    <p className="text-xs font-mono font-bold text-emerald-600 dark:text-[#4edea3] mt-0.5">
                      {(selectedNode.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {selectedNode.description && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754] space-y-1">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-[#c2c6d6] uppercase font-bold tracking-wider">
                      Description
                    </span>
                    <p className="text-xs text-slate-600 dark:text-[#c2c6d6] leading-relaxed">{selectedNode.description}</p>
                  </div>
                )}
              </div>
            ) : (
              <div data-tour="knowledge-graph-evidence" className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#171b26] border border-slate-200 dark:border-[#424754] flex items-center justify-center text-xl mx-auto">
                  👉
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-[#dfe2f1]">No Entity Selected</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#c2c6d6] max-w-xs mx-auto">
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
            <div className="bg-white dark:bg-[#0a0e18]/80 border border-slate-200 dark:border-[#424754] rounded-2xl p-10 text-center space-y-2 shadow-sm">
              <span className="text-2xl">✅</span>
              <p className="text-sm font-bold text-slate-900 dark:text-[#dfe2f1]">No Conflicts Detected</p>
              <p className="text-xs text-slate-600 dark:text-[#c2c6d6]">No contradictory values found across document evidence.</p>
            </div>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                className="p-4 bg-white dark:bg-[#0a0e18]/90 border border-amber-300 dark:border-[#ffb95f]/40 rounded-2xl space-y-2 shadow-sm backdrop-blur-md"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-amber-700 dark:text-[#ffb95f] flex items-center space-x-1.5">
                    <span>⚠️</span>
                    <span>Conflict: {c.conflictType}</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-[#ffb95f]/10 text-amber-800 dark:text-[#ffb95f] border border-amber-200 dark:border-[#ffb95f]/30 font-bold uppercase">
                    Status: {c.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#c2c6d6] leading-relaxed">Contradictory values detected across document evidence.</p>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'gaps' ? (
        <div data-tour="knowledge-graph-gaps" className="space-y-4">
          {gaps.length === 0 ? (
            <div className="bg-white dark:bg-[#0a0e18]/80 border border-slate-200 dark:border-[#424754] rounded-2xl p-10 text-center space-y-2 shadow-sm">
              <span className="text-2xl">🧩</span>
              <p className="text-sm font-bold text-slate-900 dark:text-[#dfe2f1]">No Knowledge Gaps Detected</p>
              <p className="text-xs text-slate-600 dark:text-[#c2c6d6]">All concepts have sufficient grounded document coverage.</p>
            </div>
          ) : (
            gaps.map((g, idx) => (
              <div
                key={idx}
                className="p-4 bg-white dark:bg-[#0a0e18]/90 border border-slate-200 dark:border-[#424754] rounded-2xl space-y-2 shadow-sm backdrop-blur-md"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-indigo-700 dark:text-[#adc6ff]">{g.entityName || 'General Knowledge Gap'}</span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-[#4d8eff]/10 text-indigo-700 dark:text-[#adc6ff] border border-indigo-200 dark:border-[#4d8eff]/30 font-bold uppercase">
                    {g.priority} PRIORITY
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#c2c6d6] leading-relaxed">{g.description}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div data-tour="knowledge-graph-entities" className="bg-white dark:bg-[#0a0e18]/90 border border-slate-200 dark:border-[#424754] rounded-2xl p-6 space-y-4 shadow-sm dark:shadow-2xl backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-[#424754]/60 pb-3">
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-[#adc6ff] uppercase tracking-wider">
              Graph Network Registry
            </span>
            <span className="text-xs font-mono text-slate-600 dark:text-[#c2c6d6]">
              {nodes.length} Entities | {edges.length} Relationships
            </span>
          </div>

          {nodes.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-[#c2c6d6] text-center py-6">No entity entries registered in graph index.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {nodes.map((n) => (
                <div key={n.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754] space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-indigo-600 dark:text-[#adc6ff] font-bold uppercase">{n.entityType}</span>
                    <span className="text-emerald-600 dark:text-[#4edea3]">{(n.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="font-bold text-xs text-slate-900 dark:text-[#dfe2f1] truncate">{n.canonicalName}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
