'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type WebSource = {
  id: string;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  status: string;
  contentHash?: string | null;
  fetchedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  knowledgeBases?: Array<{ id: string; name: string }>;
};

type KnowledgeBaseOption = {
  id: string;
  name: string;
};

export default function WebSourcesPage() {
  const [activeTab, setActiveTab] = useState<'saved' | 'discovered'>('saved');
  const [urlInput, setUrlInput] = useState('');
  const [selectedKbId, setSelectedKbId] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [webSources, setWebSources] = useState<WebSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchWebSources = useCallback(async () => {
    try {
      const res = await fetch('/api/web-sources');
      const json = await res.json();
      if (json.success) {
        setWebSources(json.data.items || []);
      }
    } catch (err) {
      console.error('Failed to load web sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch('/api/knowledge-bases?pageSize=100');
      const json = await res.json();
      if (json.success) {
        setKnowledgeBases(json.data.items || []);
      }
    } catch (err) {
      console.error('Failed to load knowledge bases:', err);
    }
  };

  useEffect(() => {
    fetchWebSources();
    fetchKnowledgeBases();
  }, [fetchWebSources]);

  const handleAddWebSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = urlInput.trim();
    if (!u || submitting) return;

    setSubmitting(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await fetch('/api/web-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: u,
          knowledgeBaseId: selectedKbId || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to ingest web source');
      }

      setSuccessBanner(`Successfully ingested web source: ${json.data.title}`);
      setUrlInput('');
      fetchWebSources();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (id: string) => {
    setActionLoadingId(id);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await fetch(`/api/web-sources/${id}/refresh`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to refresh web source');
      }

      setSuccessBanner(json.data.message || 'Web source refreshed successfully.');
      fetchWebSources();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this web source?')) return;
    setActionLoadingId(id);

    try {
      const res = await fetch(`/api/web-sources/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to delete web source');
      }
      setSuccessBanner('Web source deleted successfully.');
      fetchWebSources();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">🌐 Web Knowledge Sources</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              Web RAG
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ingest public documentation pages into your RAG pipeline with SSRF security and token-aware vector search.
          </p>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center space-x-1.5"
        >
          <span>💬 Open Chat UI</span>
        </Link>
      </div>

      {/* Banners */}
      {errorBanner && (
        <div className="p-4 rounded-xl border bg-rose-950/80 border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {errorBanner}</span>
          <button onClick={() => setErrorBanner(null)}>✕</button>
        </div>
      )}
      {successBanner && (
        <div className="p-4 rounded-xl border bg-emerald-950/80 border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <span>✅ {successBanner}</span>
          <button onClick={() => setSuccessBanner(null)}>✕</button>
        </div>
      )}

      {/* Add Web Source Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>➕ Add New Web Source</span>
          </h2>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
            🔒 SSRF Protected
          </span>
        </div>

        <form onSubmit={handleAddWebSource} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Target Web Page URL</label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://react.dev/reference/react"
                required
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Assign to Knowledge Base (Optional)</label>
              <select
                value={selectedKbId}
                onChange={(e) => setSelectedKbId(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Global (All Knowledge Bases)</option>
                {knowledgeBases.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    📚 {kb.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-slate-500 italic">
              &bull; Only http:// and https:// URLs allowed. Internal IP ranges and metadata endpoints are blocked.
            </p>
            <button
              type="submit"
              disabled={submitting || !urlInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex-shrink-0"
            >
              {submitting ? 'Fetching & Embedding...' : 'Ingest Web Source →'}
            </button>
          </div>
        </form>
      </div>

      {/* Web Sources List Header & Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-bold text-white">Web Knowledge Sources ({webSources.length})</h2>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  activeTab === 'saved' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                💾 Saved Sources ({webSources.length})
              </button>
              <button
                onClick={() => setActiveTab('discovered')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  activeTab === 'discovered' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🌍 Web Discovery
              </button>
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Idempotency & Refresh Enabled</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 font-mono text-xs">Loading web sources...</div>
        ) : webSources.length === 0 ? (
          <div className="text-center py-12 text-slate-500 space-y-2">
            <span className="text-3xl block">🌐</span>
            <p className="text-xs">No web sources added yet. Ingest a URL above to start retrieval from public docs!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {webSources.map((source) => (
              <div
                key={source.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-100 text-sm truncate">{source.title}</span>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                        source.status === 'COMPLETED' || source.status === 'ACTIVE'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : source.status === 'PROCESSING'
                          ? 'bg-amber-950 text-amber-400 border-amber-800 animate-pulse'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {source.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-indigo-400 truncate max-w-xl">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {source.url} ↗
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-mono">
                    <span>Fetched: {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString() : 'N/A'}</span>
                    <span>Hash: {source.contentHash ? source.contentHash.slice(0, 12) + '...' : 'N/A'}</span>
                    {source.knowledgeBases && source.knowledgeBases.length > 0 && (
                      <span className="text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800">
                        📚 {source.knowledgeBases.map((k) => k.name).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => handleRefresh(source.id)}
                    disabled={actionLoadingId === source.id}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 text-xs font-mono text-slate-300 hover:text-white transition-all disabled:opacity-50"
                  >
                    ↻ Refresh
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    disabled={actionLoadingId === source.id}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-900 hover:bg-rose-900 text-xs font-mono text-rose-300 transition-all disabled:opacity-50"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
