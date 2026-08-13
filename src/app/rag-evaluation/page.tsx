'use client';

import { useState, useEffect, useCallback } from 'react';

type AggregatedMetrics = {
  timeRange: string;
  knowledgeBaseId: string | null;
  totalQuestions: number;
  totalAnswers: number;
  positiveFeedback: number;
  negativeFeedback: number;
  positiveFeedbackRate: number;
  fallbackCount: number;
  fallbackRate: number;
  avgResponseLatencyMs: number;
  avgRetrievalLatencyMs: number;
  avgRetrievedChunks: number;
  avgCitedChunks: number;
  avgCitationCoverage: number;
  avgRetrievalConfidence: number;
  avgGroundednessScore: number;
  avgOverallScore: number;
  evaluationCount: number;
};

type EvaluationItem = {
  id: string;
  conversationId: string;
  messageId: string;
  knowledgeBaseId: string | null;
  question: string;
  retrievalQuery: string | null;
  answer: string;
  overallScore: number | null;
  groundednessScore: number | null;
  relevanceScore: number | null;
  citationCoverageScore: number | null;
  retrievalConfidenceScore: number | null;
  latencyMs: number | null;
  retrievedChunkCount: number;
  citedChunkCount: number;
  isFallback: boolean;
  evaluatorType: string;
  feedback: {
    rating: 'POSITIVE' | 'NEGATIVE';
    reason: string | null;
    comment: string | null;
  } | null;
  createdAt: string;
};

type KnowledgeBaseOption = {
  id: string;
  name: string;
  documentCount: number;
};

export default function RAGEvaluationPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('30d');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>([]);
  const [totalEvaluations, setTotalEvaluations] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch('/api/knowledge-bases?pageSize=100');
      const json = await res.json();
      if (json.success) {
        setKnowledgeBases(json.data.items || []);
      }
    } catch (err) {
      console.error('Failed to load knowledge bases for analytics:', err);
    }
  };

  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const url = `/api/rag/metrics?timeRange=${timeRange}${selectedKbId ? `&knowledgeBaseId=${selectedKbId}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setMetrics(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [timeRange, selectedKbId]);

  const fetchEvaluations = useCallback(async (targetPage = 1, searchQ = searchTerm) => {
    setLoadingList(true);
    try {
      const url = `/api/rag/evaluations?page=${targetPage}&pageSize=15${selectedKbId ? `&knowledgeBaseId=${selectedKbId}` : ''}${searchQ ? `&search=${encodeURIComponent(searchQ)}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setEvaluations(json.data.items || []);
        setTotalEvaluations(json.data.total || 0);
        setTotalPages(json.data.totalPages || 1);
        setPage(json.data.page || 1);
      }
    } catch (err) {
      console.error('Failed to fetch evaluation list:', err);
    } finally {
      setLoadingList(false);
    }
  }, [selectedKbId, searchTerm]);

  useEffect(() => {
    fetchKnowledgeBases();
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchEvaluations(1);
  }, [fetchMetrics, fetchEvaluations]);

  const formatPct = (val: number | undefined | null) => {
    if (val === undefined || val === null) return '0.0%';
    return `${(val * 100).toFixed(1)}%`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Banner & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-950 border border-indigo-800 text-indigo-400 font-mono text-[10px] uppercase font-bold">
              Phase 19 Quality Analytics
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">RAG Evaluation & Quality Dashboard</h1>
          </div>
          <p className="text-slate-400 text-xs mt-1">
            Monitor Groundedness scores, Citation Coverage, User Feedback ratings, Latency, and Knowledge Base quality metrics.
          </p>
        </div>

        {/* Global Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="24h">⏱️ Last 24 Hours</option>
            <option value="7d">📅 Last 7 Days</option>
            <option value="30d">🗓️ Last 30 Days</option>
            <option value="90d">📊 Last 90 Days</option>
            <option value="all">🌐 All Time</option>
          </select>

          {/* Knowledge Base Scope Filter */}
          <select
            value={selectedKbId}
            onChange={(e) => setSelectedKbId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">📚 All Knowledge Bases</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                📚 {kb.name} ({kb.documentCount} docs)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Analytics KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Answer Quality</span>
          <div className="text-2xl font-bold text-indigo-400 font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : formatPct(metrics?.avgOverallScore)}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">Weighted Overall</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Groundedness</span>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : formatPct(metrics?.avgGroundednessScore)}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">Document Overlap</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Citation Coverage</span>
          <div className="text-2xl font-bold text-sky-400 font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : formatPct(metrics?.avgCitationCoverage)}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">Cited / Retrieved</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Positive Feedback</span>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : formatPct(metrics?.positiveFeedbackRate)}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">
            {metrics?.positiveFeedback || 0} 👍 / {metrics?.negativeFeedback || 0} 👎
          </span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Avg Latency</span>
          <div className="text-2xl font-bold text-white font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : `${metrics?.avgResponseLatencyMs || 0}ms`}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">End-to-End Response</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2 shadow-xl">
          <span className="text-[10px] font-mono uppercase text-slate-400">Fallback Rate</span>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {loadingMetrics ? <span className="animate-pulse">...</span> : formatPct(metrics?.fallbackRate)}
          </div>
          <span className="text-[10px] text-slate-500 block font-mono">{metrics?.fallbackCount || 0} Zero-Chunk</span>
        </div>
      </div>

      {/* Visual Quality Progress Indicator Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          RAG Quality Distribution Breakdown
        </h3>
        <div className="space-y-3 font-mono text-xs">
          {/* Groundedness Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Groundedness Index</span>
              <span className="text-emerald-400 font-bold">{formatPct(metrics?.avgGroundednessScore)}</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (metrics?.avgGroundednessScore || 0) * 100))}%` }}
              />
            </div>
          </div>

          {/* Citation Coverage Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">Citation Coverage Ratio</span>
              <span className="text-sky-400 font-bold">{formatPct(metrics?.avgCitationCoverage)}</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-sky-600 to-sky-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (metrics?.avgCitationCoverage || 0) * 100))}%` }}
              />
            </div>
          </div>

          {/* Positive Satisfaction Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-300">User Satisfaction (Positive Rate)</span>
              <span className="text-amber-400 font-bold">{formatPct(metrics?.positiveFeedbackRate)}</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, (metrics?.positiveFeedbackRate || 0) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Evaluated Questions Catalog Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Evaluated Questions Catalog</h2>
            <p className="text-xs text-slate-400">Total {totalEvaluations} evaluated assistant responses</p>
          </div>

          {/* Search Bar */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              fetchEvaluations(1, e.target.value);
            }}
            placeholder="Search questions or answers..."
            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-800/80 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3">Question & Answer</th>
                <th className="p-3">Groundedness</th>
                <th className="p-3">Citation Coverage</th>
                <th className="p-3">Rating</th>
                <th className="p-3">Latency</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {loadingList ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading evaluations history...
                  </td>
                </tr>
              ) : evaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No evaluation data recorded for the selected filter.
                  </td>
                </tr>
              ) : (
                evaluations.map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="p-3 max-w-sm">
                        <div className="font-bold text-white font-sans truncate">{item.question}</div>
                        <div className="text-[10px] text-slate-400 font-sans line-clamp-1">{item.answer}</div>
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-emerald-400">{formatPct(item.groundednessScore)}</span>
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-sky-400">{formatPct(item.citationCoverageScore)}</span>
                      </td>

                      <td className="p-3">
                        {item.feedback ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.feedback.rating === 'POSITIVE'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {item.feedback.rating === 'POSITIVE' ? '👍 Helpful' : '👎 Not Helpful'}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[10px]">Unrated</span>
                        )}
                      </td>

                      <td className="p-3 text-slate-300">
                        {item.latencyMs ? `${item.latencyMs}ms` : 'N/A'}
                      </td>

                      <td className="p-3 text-slate-500 text-[10px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-400 hover:text-indigo-300 text-[10px]"
                        >
                          {isExpanded ? 'Collapse' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded Row Detail Drawer */}
        {expandedId && (() => {
          const detailItem = evaluations.find((e) => e.id === expandedId);
          if (!detailItem) return null;
          return (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-inner text-xs font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-bold text-indigo-400 text-xs">Evaluation Detail & Context Breakdown</span>
                <span className="text-[10px] text-slate-500">ID: {detailItem.id}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] block font-bold">User Original Question:</span>
                  <p className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-white leading-relaxed">
                    {detailItem.question}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-indigo-400 text-[10px] block font-bold">Rewritten Retrieval Search Query:</span>
                  <p className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-800/60 text-indigo-200 leading-relaxed font-semibold">
                    {detailItem.retrievalQuery || detailItem.question}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 text-[10px] block font-bold">Generated Assistant Answer:</span>
                <p className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-slate-200 leading-relaxed font-sans">
                  {detailItem.answer}
                </p>
              </div>

              {/* Feedback Comment if available */}
              {detailItem.feedback && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-amber-400 font-bold text-[10px] uppercase block">
                    User Feedback ({detailItem.feedback.rating}):
                  </span>
                  {detailItem.feedback.reason && (
                    <p className="text-slate-300">Reason: {detailItem.feedback.reason}</p>
                  )}
                  {detailItem.feedback.comment && (
                    <p className="text-slate-400 italic">&quot;{detailItem.feedback.comment}&quot;</p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Pagination Footer */}
        <div className="flex items-center justify-between pt-2 text-xs font-mono text-slate-400">
          <span>
            Page {page} of {totalPages} ({totalEvaluations} total)
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => fetchEvaluations(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300"
            >
              ← Previous
            </button>
            <button
              onClick={() => fetchEvaluations(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
