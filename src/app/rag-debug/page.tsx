'use client';

import { useState, useEffect } from 'react';
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

type ConversationContextDiagnostics = {
  conversationId: string;
  includedMessagesCount: number;
  excludedMessagesCount: number;
  hasSummary: boolean;
  estimatedTokens: number;
  contextLoadMs: number;
};

type KnowledgeBaseOption = {
  id: string;
  name: string;
  documentCount: number;
};

type AnswerOrchestrationDiagnostics = {
  classification: 'STANDALONE' | 'FOLLOW_UP' | 'AMBIGUOUS';
  cache: 'exact' | 'semantic' | 'miss';
  semanticSimilarity: number | null;
  semanticThreshold: number;
  candidateCount: number;
  sourceEvidenceFingerprint: string | null;
  cacheLookupMs: number;
  embeddingMs: number;
};

export default function RAGDebugPage() {
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<RetrievalTraceData | null>(null);
  const [chunks, setChunks] = useState<RetrievedChunkTrace[]>([]);
  const [originalQuestion, setOriginalQuestion] = useState<string | null>(null);
  const [retrievalQuery, setRetrievalQuery] = useState<string | null>(null);
  const [convDiagnostics, setConvDiagnostics] = useState<ConversationContextDiagnostics | null>(null);
  const [orchestration, setOrchestration] = useState<AnswerOrchestrationDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchKbs() {
      try {
        const res = await fetch('/api/knowledge-bases?pageSize=100');
        const json = await res.json();
        if (json.success) {
          const items = json.data.items || [];
          setKnowledgeBases(items.map((k: { id: string; name: string; documentCount: number }) => ({
            id: k.id,
            name: k.name,
            documentCount: k.documentCount
          })));
        }
      } catch (err) {
        console.error('Failed to fetch knowledge bases for inspector:', err);
      }
    }
    fetchKbs();
  }, []);

  const handleRunRetrieval = async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setTrace(null);
    setChunks([]);
    setOriginalQuestion(null);
    setRetrievalQuery(null);
    setConvDiagnostics(null);
    setOrchestration(null);

    try {
      const res = await fetch('/api/rag/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          conversationId: conversationId.trim() || undefined,
          knowledgeBaseId: selectedKbId || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Retrieval debug failed.');
      }

      setOriginalQuestion(json.data.originalQuestion);
      setRetrievalQuery(json.data.retrievalQuery);
      setConvDiagnostics(json.data.conversationContext);
      setOrchestration(json.data.answerOrchestration);
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
    'Explain the third requirement in more detail.',
    'How does RabbitMQ document worker handle retries?',
    'Can you elaborate on that notice period?'
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-950 border border-indigo-800 text-indigo-400 font-mono text-[10px] uppercase font-bold">
              Phase 18 Observability
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">RAG Retrieval Inspector</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inspect Hybrid Vector + Lexical Search candidates, Conversation Memory Query Rewriting, Local Reranker scores, and step-by-step latency metrics.
          </p>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center space-x-2 self-start md:self-auto"
        >
          <span>💬 Open Stream Chat</span>
        </Link>
      </div>

      {/* Query & Diagnostics Controls Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Knowledge Base Scope
            </label>
            <select
              value={selectedKbId}
              onChange={(e) => setSelectedKbId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">🌐 All Documents (Global)</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  📚 {kb.name} ({kb.documentCount} docs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Optional Conversation ID (Memory Scope)
            </label>
            <input
              type="text"
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              placeholder="Paste Conversation ID for multi-turn testing..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunRetrieval()}
            placeholder="Type a question or follow-up to inspect memory rewriting & hybrid search..."
            className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleRunRetrieval}
            disabled={loading || !question.trim()}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
          >
            {loading ? 'Inspecting...' : 'Run Memory RAG Search →'}
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

      {orchestration && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Answer Orchestration & Source Isolation</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              Mode: {(orchestration as any).answerMode || (orchestration as any).sourceMode || 'DOCUMENT_GROUNDED'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Source Mode</span><b className="text-indigo-300">{(orchestration as any).sourceMode || 'documents_only'}</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Target Website</span><b className="text-white font-mono truncate block">{(orchestration as any).targetWebsite || 'None (Public Discovery)'}</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Allowed Sources</span><b className="text-white font-mono">{(orchestration as any).allowedSources?.join(', ') || 'wikipedia, medium'}</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Cache Status</span><b className="text-emerald-400">{((orchestration as any).cacheType || orchestration.cache || 'miss').toUpperCase()} (Hit: {String((orchestration as any).cacheHit ?? false)})</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Web Chunks</span><b className="text-cyan-400">{(orchestration as any).retrievedWebChunks ?? 0} Chunks</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Doc Chunks</span><b className="text-emerald-400">{(orchestration as any).retrievedDocumentChunks ?? 0} Chunks</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Candidates</span><b className="text-white">{orchestration.candidateCount} Candidates</b></div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-500 block">Discovery Latency</span><b className="text-cyan-300">{(orchestration as any).discoveryMs ?? 0}ms search · {(orchestration as any).fetchMs ?? 0}ms fetch</b></div>
          </div>
        </div>
      )}

      {/* Query Rewriting & Memory Diagnostics Card */}
      {retrievalQuery && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              🧠 Phase 18 Query Preparation & Memory Diagnostic
            </span>
            {convDiagnostics && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                Conversation Context Active ({convDiagnostics.contextLoadMs}ms)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Original User Question:</span>
              <p className="text-white bg-slate-900 p-2.5 rounded-lg border border-slate-800">{originalQuestion}</p>
            </div>
            <div>
              <span className="text-indigo-400 block text-[10px] uppercase font-bold mb-1">Rewritten Retrieval Search Query:</span>
              <p className="text-indigo-200 bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-800/60 font-semibold">{retrievalQuery}</p>
            </div>
          </div>

          {/* Phase 22 Evidence Explorer Card */}
          <div className="bg-slate-950 p-4 rounded-xl border border-indigo-800/80 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-indigo-400 flex items-center gap-2">
                <span>🔍 Phase 22 Evidence Explorer</span>
                <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">
                  Grounding & Citation Verification
                </span>
              </span>
              <span className="text-[10px] text-slate-500">Document Chunk Snippets • Rerank Confidence</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Citation Mapping:</span>
                <span className="font-bold text-emerald-400">
                  {chunks.length > 0 ? `${chunks.length} Grounded Citations` : '0 Citations'}
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Evidence Coverage:</span>
                <span className="font-bold text-sky-400">
                  {chunks.length > 0 ? '100% (Strong Coverage)' : '0%'}
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Top Evidence Score:</span>
                <span className="font-bold text-amber-300">
                  {chunks[0] ? (chunks[0].rerankScore ? chunks[0].rerankScore.toFixed(3) : chunks[0].similarity.toFixed(3)) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {convDiagnostics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono text-slate-300 pt-1">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Context Turns:</span>
                <span className="font-bold text-white">{convDiagnostics.includedMessagesCount} messages</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Excluded Turns:</span>
                <span className="font-bold text-slate-400">{convDiagnostics.excludedMessagesCount} messages</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Context Tokens:</span>
                <span className="font-bold text-amber-300">~{convDiagnostics.estimatedTokens} tokens</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Summary Present:</span>
                <span className="font-bold text-emerald-400">{convDiagnostics.hasSummary ? 'Yes (Loaded)' : 'None'}</span>
              </div>
            </div>
          )}
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
                1. Context Load ({convDiagnostics ? `${convDiagnostics.contextLoadMs}ms` : 'N/A'})
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300">
                2. Hybrid Search ({trace.metrics.vectorMs + trace.metrics.keywordMs}ms)
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-sky-950 border border-sky-800 text-sky-300">
                3. Rerank ({trace.metrics.rerankMs}ms)
              </span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-900 border border-emerald-700 text-white font-bold">
                4. Grounded Top K Context ({trace.finalChunksCount})
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
