'use client';

import { useState } from 'react';
import Link from 'next/link';

type RetrievedChunkTrace = {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  similarity: number;
  vectorScore?: number;
  keywordScore?: number;
  hybridScore?: number;
  rerankScore?: number;
  retrievalSource?: 'vector' | 'keyword' | 'hybrid';
};

type RetrievalTraceData = {
  query: string;
  vectorCandidatesCount: number;
  keywordCandidatesCount: number;
  mergedCandidatesCount: number;
  deduplicatedCandidatesCount: number;
  rerankedCandidatesCount: number;
  finalChunksCount: number;
  metrics: {
    vectorMs: number;
    keywordMs: number;
    mergeMs: number;
    rerankMs: number;
    totalMs: number;
  };
};

export default function RAGDebugPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<RetrievalTraceData | null>(null);
  const [chunks, setChunks] = useState<RetrievedChunkTrace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  const handleRunRetrieval = async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setTrace(null);
    setChunks([]);

    try {
      const res = await fetch('/api/rag/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Retrieval debug failed.');
      }

      setTrace(json.data.trace);
      setChunks(json.data.chunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error executing retrieval inspection.');
    } finally {
      setLoading(false);
    }
  };

  const sampleQueries = [
    'What is the architecture overview of the platform?',
    'What is the deployment procedure for production?',
    'How does RabbitMQ document worker handle retries?',
    'What is the vector dimension for nomic-embed-text?'
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-950 border border-indigo-800 text-indigo-400 font-mono text-[10px] uppercase font-bold">
              Phase 14 Observability
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">RAG Retrieval Inspector</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inspect Hybrid Vector + Lexical Search candidates, Local Reranker scores, and step-by-step latency metrics.
          </p>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center space-x-2 self-start md:self-auto"
        >
          <span>💬 Open Stream Chat</span>
        </Link>
      </div>

      {/* Query Input Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
          Enter Inspection Query
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunRetrieval()}
            placeholder="Type a query to inspect hybrid vector + keyword retrieval behavior..."
            className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleRunRetrieval}
            disabled={loading || !question.trim()}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
          >
            {loading ? 'Running Search...' : 'Run Hybrid Retrieval →'}
          </button>
        </div>

        {/* Sample Queries */}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-[11px] font-mono text-slate-500 py-1">Try query:</span>
          {sampleQueries.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuestion(sq);
              }}
              className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 bg-slate-950 hover:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-800 transition-colors"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Trace Metrics Dashboard */}
      {trace && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Vector Search</span>
              <div className="text-lg font-bold text-white font-mono">{trace.metrics.vectorMs}ms</div>
              <span className="text-[10px] text-indigo-400">{trace.vectorCandidatesCount} candidates</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Keyword Search</span>
              <div className="text-lg font-bold text-white font-mono">{trace.metrics.keywordMs}ms</div>
              <span className="text-[10px] text-emerald-400">{trace.keywordCandidatesCount} candidates</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Merged Set</span>
              <div className="text-lg font-bold text-white font-mono">{trace.deduplicatedCandidatesCount}</div>
              <span className="text-[10px] text-amber-400">deduplicated</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Rerank Latency</span>
              <div className="text-lg font-bold text-white font-mono">{trace.metrics.rerankMs}ms</div>
              <span className="text-[10px] text-sky-400">LocalReranker</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 col-span-2 md:col-span-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Total Pipeline</span>
              <div className="text-lg font-bold text-emerald-400 font-mono">{trace.metrics.totalMs}ms</div>
              <span className="text-[10px] text-slate-400">{trace.finalChunksCount} top K chunks</span>
            </div>
          </div>

          {/* Ranking Pipeline Visual Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Retrieval Pipeline Execution Path
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-3 py-1.5 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-300">
                1. Vector ({trace.vectorCandidatesCount})
              </span>
              <span className="text-slate-600">+</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300">
                2. Lexical ({trace.keywordCandidatesCount})
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-amber-950 border border-amber-800 text-amber-300">
                3. Merge & Deduplicate ({trace.deduplicatedCandidatesCount})
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-sky-950 border border-sky-800 text-sky-300">
                4. Rerank ({trace.rerankedCandidatesCount})
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-900 border border-emerald-700 text-white font-bold">
                5. Top K Context ({trace.finalChunksCount})
              </span>
            </div>
          </div>

          {/* Retrieved Chunks Breakdown */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Final Grounded Chunks ({chunks.length})
            </h3>

            {chunks.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-500 font-mono text-xs">
                No document chunks passed the similarity threshold (RAG_MIN_SIMILARITY). Fallback triggered.
              </div>
            ) : (
              chunks.map((chunk, idx) => {
                const isExpanded = expandedChunkId === chunk.id;
                return (
                  <div key={chunk.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <span className="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 font-mono text-xs font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-white">{chunk.filename}</span>
                          <span className="text-xs text-slate-500 font-mono ml-2">• Page {chunk.pageNumber}</span>
                        </div>
                      </div>

                      {/* Source Badge */}
                      <span
                        className={`self-start md:self-auto px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                          chunk.retrievalSource === 'hybrid'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : chunk.retrievalSource === 'vector'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}
                      >
                        Source: {chunk.retrievalSource || 'vector'}
                      </span>
                    </div>

                    {/* Scores Breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Vector Score:</span>
                        <span className="text-indigo-300 font-bold">{((chunk.vectorScore ?? chunk.similarity) * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Keyword Score:</span>
                        <span className="text-emerald-300 font-bold">{((chunk.keywordScore ?? 0) * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Hybrid Score:</span>
                        <span className="text-amber-300 font-bold">{((chunk.hybridScore ?? chunk.similarity) * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Rerank Score:</span>
                        <span className="text-sky-300 font-bold">{((chunk.rerankScore ?? chunk.hybridScore ?? chunk.similarity) * 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Content Preview & Toggle */}
                    <div className="space-y-2">
                      <p className={`text-xs text-slate-300 font-mono leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 ${!isExpanded ? 'line-clamp-3' : ''}`}>
                        {chunk.content}
                      </p>
                      <button
                        onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                        className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300"
                      >
                        {isExpanded ? '▲ Collapse snippet' : '▼ Expand full chunk text'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
