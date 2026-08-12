'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type DocumentDetail = {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  status: string;
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

export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = params.id as string;

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [chunkStats, setChunkStats] = useState<ChunkStats>({ totalChunks: 0, embeddedChunks: 0 });
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="max-w-7xl mx-auto space-y-8">
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
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">{document.filename}</h1>
        </div>

        <div className="flex items-center space-x-3">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              document.status === 'PROCESSING'
                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                : document.status === 'COMPLETED'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : document.status === 'FAILED'
                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {document.status}
          </span>
          <button
            onClick={() => fetchDetail()}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

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
                <span className="text-slate-500 font-mono block">Storage Key:</span>
                <span className="text-slate-300 font-mono text-[11px] break-all bg-slate-950 p-2 rounded-lg border border-slate-800 block">
                  {document.storageKey}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-mono block">Uploaded Date:</span>
                <span className="text-slate-300 font-mono">{new Date(document.createdAt).toLocaleString()}</span>
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
                <span className="text-indigo-400 font-semibold">Ollama Local</span>
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
                    <p className="text-xs font-semibold text-white">Step 2: Storage Persistence</p>
                    <p className="text-[11px] text-slate-400">Saved under storage/documents/{document.id}</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">Completed</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-white">Step 3: RabbitMQ Job Enqueued</p>
                    <p className="text-[11px] text-slate-400">Payload dispatched to queue: &quot;document-processing&quot;</p>
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
                    <p className="text-xs font-semibold text-white">Step 6 & 7: Ollama Embeddings & pgvector</p>
                    <p className="text-[11px] text-slate-400">
                      {chunkStats.embeddedChunks > 0
                        ? `Embedded ${chunkStats.embeddedChunks} / ${chunkStats.totalChunks} chunks in PostgreSQL vector(768)`
                        : 'Waiting for embedding batch process...'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-indigo-400">
                  {chunkStats.embeddedChunks} Embedded
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 opacity-60">
                <div className="flex items-center space-x-3">
                  <span className="text-slate-500 text-lg">🔒</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-300">Step 8: Grounded RAG Retrieval</p>
                    <p className="text-[11px] text-slate-500">Top-K similarity search, citations, and LLM chat</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700">
                  Phase 11
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
                  <span className="text-slate-200 font-semibold">LocalStorageProvider</span>
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
                  <span className="text-indigo-400 font-semibold">Ollama nomic-embed</span>
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
    </div>
  );
}
