'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

type DocumentDetail = {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  status: string;
  isArchived?: boolean;
  isDeleted?: boolean;
  pageCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

type ChunkStats = {
  totalChunks: number;
  embeddedChunks: number;
};

type ChunkDetail = {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  hasEmbedding: boolean;
};

// Phase 69A — Document Intelligence. Old/pre-69A/flag-disabled documents have no row for this at
// all, so every field is treated as absent-by-default rather than required.
type DocumentIntelligenceData = {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  stage?: string | null;
  documentType?: string | null;
  classificationConfidence?: number | null;
  extractedMetadata?: {
    title?: string;
    author?: string;
    createdDate?: string;
    keywords?: string[];
    summary?: string;
    language?: string;
  } | null;
  chunkingStrategy?: string | null;
  legacyFallbackUsed: boolean;
} | null;

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = params.id as string;
  const targetPageParam = searchParams.get('page');

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [chunkStats, setChunkStats] = useState<ChunkStats>({ totalChunks: 0, embeddedChunks: 0 });
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);
  const [storageProvider, setStorageProvider] = useState<string>('local');
  const [intelligence, setIntelligence] = useState<DocumentIntelligenceData>(null);
  const [multimodalRun, setMultimodalRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(true);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      const json = await res.json();
      if (json.success) {
        setDocument(json.data.document);
        setChunkStats(json.data.chunkStats);
        setChunks(json.data.chunks);
        setStorageProvider(json.data.storageProvider || 'local');
      }
    } catch (err) {
      console.error('Failed to fetch document detail:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Decoupled from fetchDetail: intelligence data is optional and must never block or delay the
  // core document/chunks view (old documents will simply get `intelligence: null` back).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${documentId}/intelligence`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) {
          setIntelligence(json.data.intelligence);
          setMultimodalRun(json.data.multimodalRun);
        }
      })
      .catch((err) => console.error('Failed to fetch document intelligence:', err));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Auto-polling for active processing status
  useEffect(() => {
    if (!document || (document.status !== 'PROCESSING' && document.status !== 'UPLOADING')) {
      return;
    }

    const timer = setInterval(() => {
      fetchDetail();
    }, 2500);

    return () => clearInterval(timer);
  }, [document, fetchDetail]);

  const handleRetry = async () => {
    if (!document) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/retry`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to retry processing');
      }
      setBannerMessage({ type: 'success', text: 'Retrying document processing pipeline...' });
      fetchDetail();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to retry processing.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReprocess = async () => {
    if (!document) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/reprocess`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to reprocess document');
      }
      setBannerMessage({ type: 'success', text: 'Reprocessing started. Existing chunks cleared.' });
      fetchDetail();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reprocess document.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!document) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to delete document');
      }
      router.push('/documents');
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete document.'
      });
      setIsDeleteModalOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center text-slate-400 font-mono">
        Loading document pipeline details...
      </div>
    );
  }

  if (!document) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center space-y-4">
        <p className="text-rose-400 font-semibold">Document not found or access denied.</p>
        <Link href="/documents" className="inline-block px-4 py-2 rounded-lg bg-slate-800 text-indigo-400 text-xs font-semibold">
          ← Back to Documents
        </Link>
      </div>
    );
  }

  const embeddingPercentage =
    chunkStats.totalChunks > 0 ? Math.round((chunkStats.embeddedChunks / chunkStats.totalChunks) * 100) : 0;

  const isFailed = document.status === 'FAILED';
  const isProcessing = document.status === 'PROCESSING' || document.status === 'UPLOADING';
  const isCompleted = document.status === 'COMPLETED';

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <Link href="/documents" className="text-slate-400 hover:text-white text-sm">
              ← Documents
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-slate-400">{document.id}</span>
          </div>
          <div className="flex items-center space-x-3 mt-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">{document.filename}</h1>
            <span className="px-2.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono text-xs font-semibold uppercase">
              {storageProvider} Storage
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {isCompleted && (
            <Link
              href="/chat"
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/30 transition-all flex items-center space-x-1.5"
            >
              <span>💬 Ask in Chat</span>
            </Link>
          )}

          <a
            href={`/api/documents/${document.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
          >
            ⬇ Download PDF
          </a>

          {isFailed && (
            <button
              disabled={actionLoading}
              onClick={handleRetry}
              className="px-3.5 py-2 rounded-xl bg-amber-950 border border-amber-800 text-xs font-semibold text-amber-300 hover:bg-amber-900 transition-colors disabled:opacity-50"
            >
              ↻ Retry Processing
            </button>
          )}

          {(isCompleted || isFailed) && (
            <button
              disabled={actionLoading}
              onClick={handleReprocess}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              ⚡ Reprocess
            </button>
          )}

          <button
            disabled={actionLoading}
            onClick={async () => {
              setActionLoading(true);
              try {
                const endpoint = document?.isArchived ? 'restore' : 'archive';
                const res = await fetch(`/api/documents/${documentId}/${endpoint}`, { method: 'POST' });
                const json = await res.json();
                if (json.success) {
                  setBannerMessage({ type: 'success', text: `Document ${endpoint}d successfully.` });
                  fetchDetail();
                }
              } catch (err) {
                setBannerMessage({ type: 'error', text: 'Failed to update archive status.' });
              } finally {
                setActionLoading(false);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-purple-950 border border-purple-800 text-xs font-semibold text-purple-300 hover:bg-purple-900 transition-colors disabled:opacity-50"
          >
            {document?.isArchived ? '🔓 Restore' : '📦 Archive'}
          </button>

          <button
            disabled={actionLoading}
            onClick={async () => {
              setActionLoading(true);
              try {
                const res = await fetch(`/api/documents/${documentId}/reindex`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ strategy: 'FULL_REINDEX' })
                });
                const json = await res.json();
                if (json.success) {
                  setBannerMessage({ type: 'success', text: 'Document reindex requested.' });
                  fetchDetail();
                }
              } catch (err) {
                setBannerMessage({ type: 'error', text: 'Failed to request reindex.' });
              } finally {
                setActionLoading(false);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-indigo-950 border border-indigo-800 text-xs font-semibold text-indigo-300 hover:bg-indigo-900 transition-colors disabled:opacity-50"
          >
            🔵 Reindex
          </button>

          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-rose-950/80 border border-rose-900 text-xs font-semibold text-rose-300 hover:bg-rose-900 transition-colors"
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Target Page Evidence Banner */}
      {targetPageParam && (
        <div className="p-4 rounded-xl border bg-indigo-950/80 border-indigo-800 text-xs flex items-center justify-between text-indigo-200">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-indigo-400">🔍 RAG Evidence Explorer:</span>
            <span>Inspecting Page <strong>{targetPageParam}</strong> referenced by chat answer citation.</span>
          </div>
          <span className="text-[10px] font-mono bg-indigo-900/60 px-2 py-1 rounded border border-indigo-700/60 text-indigo-300">
            Page {targetPageParam} Highlighted
          </span>
        </div>
      )}

      {/* Banner Alert */}
      {bannerMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            bannerMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span>{bannerMessage.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{bannerMessage.text}</span>
          </div>
          <button onClick={() => setBannerMessage(null)} className="hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Overview & Pipeline Steps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metadata & Embedding Card */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">Document Information</h2>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 font-mono block">Original Filename:</span>
                <span className="text-slate-200 font-medium break-all">{document.originalFilename}</span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">File Size:</span>
                <span className="text-slate-200 font-mono">{(document.fileSize / 1024 / 1024).toFixed(2)} MB ({document.fileSize.toLocaleString()} bytes)</span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">MIME Type:</span>
                <span className="text-slate-200 font-mono">{document.mimeType}</span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">Storage Key ({storageProvider.toUpperCase()}):</span>
                <span className="text-slate-300 font-mono text-[11px] break-all bg-slate-950 p-2 rounded-lg border border-slate-800 block">
                  {document.storageKey}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">Uploaded Date:</span>
                <span className="text-slate-300 font-mono">{new Date(document.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">Last Updated:</span>
                <span className="text-slate-300 font-mono">{new Date(document.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            {document.errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs space-y-1">
                <span className="font-bold">Pipeline Error:</span>
                <p className="font-mono text-[11px] break-all">{document.errorMessage}</p>
              </div>
            )}
          </div>

          {/* Real Embedding Progress Card */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">Embedding Progress</h2>
              <span className="text-xs font-mono text-emerald-400 font-bold">{embeddingPercentage}%</span>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${embeddingPercentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>{chunkStats.embeddedChunks} of {chunkStats.totalChunks} chunks embedded</span>
                <span>{chunkStats.totalChunks - chunkStats.embeddedChunks} pending</span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 border border-slate-800/80 p-3.5 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Provider:</span>
                <span className="text-indigo-400 font-semibold">Ollama / OpenAI Dual</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Model:</span>
                <span className="text-slate-200">nomic-embed-text</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dimensions:</span>
                <span className="text-slate-200">768d</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vector Index:</span>
                <span className="text-slate-200">HNSW (vector_cosine_ops)</span>
              </div>
            </div>
          </div>

          {/* Document Intelligence Card (Phase 69A) — renders nothing but a "not available" hint
              for documents with no intelligence data (pre-69A, disabled flag, or still pending). */}
          {intelligence && intelligence.status === 'COMPLETED' ? (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white">Document Intelligence</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {intelligence.chunkingStrategy === 'semantic' ? 'Semantic Chunking' : 'Legacy Chunking'}
                </span>
              </div>

              {intelligence.documentType && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono">Classification:</span>
                  <span className="px-2.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono font-semibold uppercase">
                    {intelligence.documentType}
                    {typeof intelligence.classificationConfidence === 'number' &&
                      ` · ${Math.round(intelligence.classificationConfidence * 100)}%`}
                  </span>
                </div>
              )}

              {intelligence.extractedMetadata?.title && (
                <div>
                  <span className="text-slate-500 font-mono block text-xs">Title:</span>
                  <span className="text-slate-200 text-xs font-medium">{intelligence.extractedMetadata.title}</span>
                </div>
              )}

              {intelligence.extractedMetadata?.author && (
                <div>
                  <span className="text-slate-500 font-mono block text-xs">Author:</span>
                  <span className="text-slate-200 text-xs">{intelligence.extractedMetadata.author}</span>
                </div>
              )}

              {intelligence.extractedMetadata?.summary && (
                <div>
                  <span className="text-slate-500 font-mono block text-xs">Summary:</span>
                  <p className="text-slate-300 text-xs leading-relaxed">{intelligence.extractedMetadata.summary}</p>
                </div>
              )}

              {intelligence.extractedMetadata?.keywords && intelligence.extractedMetadata.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {intelligence.extractedMetadata.keywords.map((kw) => (
                    <span key={kw} className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Multimodal Document Intelligence Card (Phase 69C) */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>✨</span> Multimodal Intelligence
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                {multimodalRun?.status || 'COMPLETED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] block">OCR Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  ✓ {multimodalRun?.ocrEnabled ? 'Active' : 'Completed'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] block">Tables Extracted</span>
                <span className="text-indigo-400 font-semibold flex items-center gap-1">
                  📊 {multimodalRun?.tablesExtracted ?? 0} Tables
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] block">Images Analyzed</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  🖼 {multimodalRun?.imagesAnalyzed ?? 0} Images
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 text-[10px] block">Charts Detected</span>
                <span className="text-indigo-400 font-semibold flex items-center gap-1">
                  📈 {multimodalRun?.chartsExtracted ?? 0} Charts
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Pipeline Steps & Developer Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pipeline Step Checklist */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
              Processing Pipeline Milestones
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-white">Step 1: Document Upload</p>
                    <p className="text-[11px] text-slate-400">Multipart PDF upload validated</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">Completed</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-white">Step 2: Storage Persistence ({storageProvider.toUpperCase()})</p>
                    <p className="text-[11px] text-slate-400">Persisted via StorageProvider abstraction</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">Completed</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-white">Step 3: RabbitMQ Job Enqueued</p>
                    <p className="text-[11px] text-slate-400">Dispatched to &quot;document-processing&quot; queue</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">Completed</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  {document.pageCount > 0 ? (
                    <span className="text-emerald-400 text-lg">✓</span>
                  ) : isFailed ? (
                    <span className="text-rose-400 text-lg">❌</span>
                  ) : (
                    <span className="text-amber-400 text-lg animate-pulse">⏳</span>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-white">Step 4: PDF Text Extraction</p>
                    <p className="text-[11px] text-slate-400">
                      {document.pageCount > 0
                        ? `Extracted ${document.pageCount} pages using pdfjs-dist`
                        : isFailed
                        ? 'Failed during PDF parsing'
                        : 'Worker extracting PDF page text...'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-300">
                  {document.pageCount > 0 ? `${document.pageCount} Pages` : isFailed ? 'Failed' : 'Processing'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  {chunkStats.totalChunks > 0 ? (
                    <span className="text-emerald-400 text-lg">✓</span>
                  ) : isFailed ? (
                    <span className="text-rose-400 text-lg">❌</span>
                  ) : (
                    <span className="text-amber-400 text-lg animate-pulse">⏳</span>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-white">Step 5: Smart Token Chunking</p>
                    <p className="text-[11px] text-slate-400">
                      {chunkStats.totalChunks > 0
                        ? `Generated ${chunkStats.totalChunks} chunks (cl100k_base 800/120)`
                        : isFailed
                        ? 'Failed during chunking'
                        : 'Generating token chunks...'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-300">
                  {chunkStats.totalChunks > 0 ? `${chunkStats.totalChunks} Chunks` : 'Pending'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  {chunkStats.embeddedChunks > 0 && chunkStats.embeddedChunks === chunkStats.totalChunks ? (
                    <span className="text-emerald-400 text-lg">✓</span>
                  ) : isFailed ? (
                    <span className="text-rose-400 text-lg">❌</span>
                  ) : isProcessing ? (
                    <span className="text-amber-400 text-lg animate-pulse">⏳</span>
                  ) : (
                    <span className="text-slate-500 text-lg">○</span>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-white">Step 6 & 7: Vector Embeddings & pgvector</p>
                    <p className="text-[11px] text-slate-400">
                      {chunkStats.embeddedChunks > 0
                        ? `Embedded ${chunkStats.embeddedChunks} / ${chunkStats.totalChunks} chunks in vector(768)`
                        : 'Waiting for embedding batch process...'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-indigo-400">
                  {chunkStats.embeddedChunks} Embedded
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  {isCompleted ? (
                    <span className="text-emerald-400 text-lg">✓</span>
                  ) : (
                    <span className="text-slate-500 text-lg">○</span>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-white">Step 8: Ready for Grounded RAG</p>
                    <p className="text-[11px] text-slate-400">
                      {isCompleted ? 'Document ready for similarity search & streaming chat' : 'Awaiting completion'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">
                  {isCompleted ? 'Ready' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Developer Verification Panel (Collapsible) */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <button
              onClick={() => setShowDevPanel(!showDevPanel)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">🛠️</span>
                <h2 className="text-lg font-bold text-white">Developer Pipeline Verification Panel</h2>
              </div>
              <span className="text-xs text-indigo-400 font-mono">{showDevPanel ? 'Collapse ▲' : 'Expand ▼'}</span>
            </button>

            {showDevPanel && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Storage Driver</span>
                  <span className="text-slate-200 font-semibold">{storageProvider.toUpperCase()}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Message Queue</span>
                  <span className="text-slate-200 font-semibold">RabbitMQ Broker</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">PDF Engine</span>
                  <span className="text-slate-200 font-semibold">pdfjs-dist</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Tokenizer</span>
                  <span className="text-slate-200 font-semibold">cl100k_base</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Chunk Size / Overlap</span>
                  <span className="text-slate-200 font-semibold">800 / 120 tokens</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Embedding Provider</span>
                  <span className="text-indigo-400 font-semibold">Ollama / OpenAI</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Vector Column</span>
                  <span className="text-emerald-400 font-semibold">vector(768)</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Vector Index</span>
                  <span className="text-emerald-400 font-semibold">HNSW cosine_ops</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chunk Inspection UI Section */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Chunk Inspection UI</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect token-aware extracted chunks, page numbers, metadata, and 768-dim embedding status.
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800">
            {chunks.length} Extracted Chunks
          </span>
        </div>

        {chunks.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-mono">
            No chunks extracted yet. Document is processing or worker pipeline hasn&apos;t finished.
          </div>
        ) : (
          <div className="space-y-3">
            {chunks.map((chunk) => {
              const isExpanded = expandedChunkId === chunk.id;
              return (
                <div
                  key={chunk.id}
                  className="rounded-xl bg-slate-950 border border-slate-800/80 p-4 space-y-3 transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-indigo-300 font-mono">
                        Chunk #{chunk.chunkIndex}
                      </span>
                      <span className="text-xs font-mono text-slate-400">Page {chunk.pageNumber}</span>
                      <span className="text-xs font-mono text-slate-400">• {chunk.tokenCount} Tokens</span>
                    </div>

                    <div className="flex items-center space-x-3">
                      {chunk.hasEmbedding ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          <span>✓ 768d Vector</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                          <span>⏳ Pending Embedding</span>
                        </span>
                      )}

                      <button
                        onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                        className="text-xs text-indigo-400 hover:underline font-mono"
                      >
                        {isExpanded ? 'Hide Content ▲' : 'View Full Content ▼'}
                      </button>
                    </div>
                  </div>

                  {/* Content snippet */}
                  <p className={`text-xs text-slate-300 leading-relaxed font-sans ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {chunk.content}
                  </p>

                  {isExpanded && (
                    <div className="pt-2 space-y-2 border-t border-slate-900 text-[11px] font-mono">
                      <span className="text-slate-500 block">Metadata JSON:</span>
                      <pre className="p-3 rounded-lg bg-slate-900 text-slate-300 overflow-x-auto">
                        {JSON.stringify(chunk.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-white">Delete Document?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Are you sure you want to delete <strong className="text-white">&quot;{document.filename}&quot;</strong>?
              This will permanently remove the document from <span className="font-mono text-indigo-400">{storageProvider.toUpperCase()} Storage</span> and delete all associated page chunks and vector embeddings.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
