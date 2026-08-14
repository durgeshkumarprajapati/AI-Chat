'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Stats = {
  totalDocuments: number;
  processingDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
};

type HealthInfo = {
  status: string;
  services: {
    database: string;
    redis: string;
    rabbitmq: string;
    ollama: string;
  };
  details: {
    pgvector: string;
    embeddingModel: string;
    embeddingDimensions: string;
  };
};

type DocumentItem = {
  id: string;
  filename: string;
  fileSize: number;
  status: string;
  pageCount: number;
  createdAt: string;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocumentItem[]>([]);
  const [kbCount, setKbCount] = useState<number>(0);
  const [convCount, setConvCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, healthRes, docsRes, kbsRes, convsRes] = await Promise.all([
          fetch('/api/stats').then((r) => r.json()),
          fetch('/api/health').then((r) => r.json()),
          fetch('/api/documents').then((r) => r.json()),
          fetch('/api/knowledge-bases').then((r) => r.json()),
          fetch('/api/conversations').then((r) => r.json())
        ]);

        if (statsRes.success) setStats(statsRes.data);
        if (healthRes.services) setHealth(healthRes);
        if (docsRes.success) {
          const items = Array.isArray(docsRes.data) ? docsRes.data : docsRes.data.items || [];
          setRecentDocs(items.slice(0, 5));
        }
        if (kbsRes.success) setKbCount(kbsRes.data.total || 0);
        if (convsRes.success) {
          const total = convsRes.data.total !== undefined ? convsRes.data.total : (Array.isArray(convsRes.data) ? convsRes.data.length : 0);
          setConvCount(total);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const pipelineSteps = [
    { title: 'Upload', desc: 'PDF Multi-part', icon: '📁', status: 'ready' },
    { title: 'Storage', desc: 'Storage Provider', icon: '💾', status: 'ready' },
    { title: 'RabbitMQ', desc: 'Async Queue', icon: '⚡', status: 'ready' },
    { title: 'PDF Parser', desc: 'pdfjs-dist Engine', icon: '📄', status: 'ready' },
    { title: 'Chunked', desc: 'cl100k_base 800/120', icon: '🧩', status: 'ready' },
    { title: 'pgvector', desc: '768d HNSW Index', icon: '🗄️', status: 'ready' },
    { title: 'Hybrid Search', desc: 'Vector + Lexical', icon: '🔀', status: 'ready' },
    { title: 'Local Reranker', desc: 'Term & Phrase Match', icon: '📊', status: 'ready' }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time pipeline monitoring, storage metrics, knowledge bases, and pgvector status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/rag-evaluation"
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sky-300 font-semibold text-sm transition-all"
          >
            <span>📈 RAG Quality</span>
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-emerald-300 font-semibold text-sm transition-all"
          >
            <span>💬 Conversations ({convCount})</span>
          </Link>
          <Link
            href="/knowledge-bases"
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-indigo-300 font-semibold text-sm transition-all"
          >
            <span>📚 Knowledge Bases</span>
          </Link>
          <Link
            href="/documents"
            className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 transition-all"
          >
            <span>Upload PDF Document</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* Real Metrics Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Conversations</span>
            <span className="text-xl">💬</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {loading ? <span className="animate-pulse">...</span> : convCount}
          </div>
          <p className="text-xs text-slate-500 font-mono">Multi-turn Memory</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Knowledge Bases</span>
            <span className="text-xl">📚</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {loading ? <span className="animate-pulse">...</span> : kbCount}
          </div>
          <p className="text-xs text-slate-500 font-mono">Scoped Collections</p>
        </div>

        <Link href="/web-sources" className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl hover:border-indigo-500 transition-all block">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Web Sources</span>
            <span className="text-xl">🌐</span>
          </div>
          <div className="text-3xl font-bold text-cyan-400">
            {loading ? <span className="animate-pulse">...</span> : 'Active'}
          </div>
          <p className="text-xs text-indigo-400 font-mono underline">Manage Sources ↗</p>
        </Link>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Documents</span>
            <span className="text-xl">📄</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {loading ? <span className="animate-pulse">...</span> : stats?.totalDocuments ?? 0}
          </div>
          <p className="text-xs text-slate-500 font-mono">DB Record Count</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Processing Docs</span>
            <span className="text-xl">⏳</span>
          </div>
          <div className="text-3xl font-bold text-amber-400">
            {loading ? <span className="animate-pulse">...</span> : stats?.processingDocuments ?? 0}
          </div>
          <p className="text-xs text-slate-500 font-mono">RabbitMQ Queue</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Chunks</span>
            <span className="text-xl">🧩</span>
          </div>
          <div className="text-3xl font-bold text-indigo-400">
            {loading ? <span className="animate-pulse">...</span> : stats?.totalChunks ?? 0}
          </div>
          <p className="text-xs text-slate-500 font-mono">cl100k_base 800/120</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Embedded Chunks</span>
            <span className="text-xl">🧠</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {loading ? <span className="animate-pulse">...</span> : stats?.embeddedChunks ?? 0}
          </div>
          <p className="text-xs text-slate-500 font-mono">768d Vector Persisted</p>
        </div>
      </div>

      {/* Processing Pipeline Diagram */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Document Processing Pipeline</h2>
            <p className="text-xs text-slate-400 mt-0.5">Automated async workflow from browser upload to pgvector persistence.</p>
          </div>
          <span className="text-xs font-mono text-indigo-400 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800">
            Phases 7–10 Integrated
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {pipelineSteps.map((s, idx) => (
            <div
              key={s.title}
              className={`relative rounded-xl p-3 text-center space-y-1.5 border transition-all ${
                s.status === 'locked'
                  ? 'bg-slate-950/50 border-slate-800/60 opacity-60'
                  : 'bg-slate-950 border-slate-800 hover:border-indigo-500/50'
              }`}
            >
              <div className="text-2xl">{s.icon}</div>
              <p className="text-xs font-bold text-slate-200 line-clamp-1">{s.title}</p>
              <p className="text-[10px] text-slate-400 font-mono line-clamp-1">{s.desc}</p>
              {idx < pipelineSteps.length - 1 && (
                <div className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 text-slate-600 text-xs z-10">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lower Section: System Status & Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real Infrastructure Services Status */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-lg font-bold text-white">System Infrastructure</h2>
            <Link href="/health" className="text-xs text-indigo-400 hover:underline">
              View Health →
            </Link>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/60">
              <div className="flex items-center space-x-3">
                <span className="text-lg">🐘</span>
                <div>
                  <p className="text-xs font-semibold text-white">PostgreSQL + pgvector</p>
                  <p className="text-[10px] text-slate-400 font-mono">v16 • vector(768)</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  health?.services.database === 'healthy'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {health?.services.database === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/60">
              <div className="flex items-center space-x-3">
                <span className="text-lg">🐇</span>
                <div>
                  <p className="text-xs font-semibold text-white">RabbitMQ Broker</p>
                  <p className="text-[10px] text-slate-400 font-mono">document-processing</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  health?.services.rabbitmq === 'healthy'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {health?.services.rabbitmq === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/60">
              <div className="flex items-center space-x-3">
                <span className="text-lg">🔴</span>
                <div>
                  <p className="text-xs font-semibold text-white">Redis Cache</p>
                  <p className="text-[10px] text-slate-400 font-mono">Port 6379</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  health?.services.redis === 'healthy'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {health?.services.redis === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/60">
              <div className="flex items-center space-x-3">
                <span className="text-lg">🦙</span>
                <div>
                  <p className="text-xs font-semibold text-white">Ollama Local Embeddings</p>
                  <p className="text-[10px] text-slate-400 font-mono">nomic-embed-text (768d)</p>
                </div>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  health?.services.ollama === 'healthy'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                }`}
              >
                {health?.services.ollama === 'healthy' ? 'Healthy' : 'Not Connected'}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Uploaded Documents Table */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-lg font-bold text-white">Recent Uploaded Documents</h2>
              <Link href="/documents" className="text-xs text-indigo-400 hover:underline">
                View All ({stats?.totalDocuments ?? 0}) →
              </Link>
            </div>

            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading documents...</div>
            ) : recentDocs.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-slate-400 text-sm">No documents uploaded yet.</p>
                <Link
                  href="/documents"
                  className="inline-block px-4 py-2 rounded-lg bg-slate-800 text-indigo-400 text-xs font-semibold hover:bg-slate-700"
                >
                  Upload First PDF
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800/80 font-mono uppercase">
                      <th className="pb-3 font-semibold">Filename</th>
                      <th className="pb-3 font-semibold">Size</th>
                      <th className="pb-3 font-semibold">Pages</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {recentDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-950/40">
                        <td className="py-3 font-medium text-white max-w-[200px] truncate">{doc.filename}</td>
                        <td className="py-3 text-slate-400 font-mono">{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                        <td className="py-3 text-slate-300 font-mono">{doc.pageCount || '-'}</td>
                        <td className="py-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              doc.status === 'PROCESSING'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : doc.status === 'COMPLETED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : doc.status === 'FAILED'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            Inspect Pipeline →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
