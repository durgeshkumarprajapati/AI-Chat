'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

type DocumentItem = {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  status: string;
  pageCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

type KBStats = {
  totalDocuments: number;
  processingDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  totalPages: number;
  totalChunks: number;
  embeddedChunks: number;
};

type PaginatedResponse = {
  items: DocumentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: KBStats;
  storageProvider: string;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<KBStats>({
    totalDocuments: 0,
    processingDocuments: 0,
    completedDocuments: 0,
    failedDocuments: 0,
    totalPages: 0,
    totalChunks: 0,
    embeddedChunks: 0
  });
  const [storageProvider, setStorageProvider] = useState<string>('local');
  const [loading, setLoading] = useState(true);

  // Filters, Pagination, Sorting
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Selection & Delete Modal State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalTarget, setDeleteModalTarget] = useState<{ id: string; filename: string } | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortOrder,
        ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      });

      const res = await fetch(`/api/documents?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        const data = json.data as PaginatedResponse;
        setDocuments(data.items);
        setTotalPages(data.totalPages);
        setTotalItems(data.total);
        setStats(data.stats);
        setStorageProvider(data.storageProvider || 'local');
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-polling interval for items in PROCESSING or UPLOADING status
  useEffect(() => {
    const hasActiveProcessing = documents.some(
      (d) => d.status === 'PROCESSING' || d.status === 'UPLOADING'
    );

    if (!hasActiveProcessing) return;

    const timer = setInterval(() => {
      fetchDocuments();
    }, 2500);

    return () => clearInterval(timer);
  }, [documents, fetchDocuments]);

  const handleFileUpload = async (file: File) => {
    setBannerMessage(null);

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setBannerMessage({ type: 'error', text: 'Invalid file format. Only PDF files are supported.' });
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setBannerMessage({ type: 'error', text: 'File size exceeds 25 MB limit.' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);

    try {
      const formData = new FormData();
      formData.append('file', file);
      setUploadProgress(50);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      });

      setUploadProgress(80);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to upload document');
      }

      setUploadProgress(100);
      setBannerMessage({
        type: 'success',
        text: `"${file.name}" uploaded successfully! Processing started in background worker.`
      });
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred during upload.'
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleRetry = async (id: string, filename: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/documents/${id}/retry`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to retry document');
      }
      setBannerMessage({ type: 'success', text: `Retrying processing for "${filename}"...` });
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to retry document.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReprocess = async (id: string, filename: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/documents/${id}/reprocess`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to reprocess document');
      }
      setBannerMessage({ type: 'success', text: `Reprocessing queued for "${filename}". Existing chunks cleared.` });
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reprocess document.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSingle = async () => {
    if (!deleteModalTarget) return;
    const { id, filename } = deleteModalTarget;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to delete document');
      }
      setBannerMessage({ type: 'success', text: `Document "${filename}" deleted successfully.` });
      setDeleteModalTarget(null);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete document.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setActionLoading('bulk');
    try {
      for (const id of selectedIds) {
        await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      }
      setBannerMessage({ type: 'success', text: `Deleted ${selectedIds.length} selected documents.` });
      setSelectedIds([]);
      setIsBulkDeleteModalOpen(false);
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed bulk deletion.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtractGraph = async (id: string, filename: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/knowledge-graph/documents/${id}/extract`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to queue graph extraction');
      setBannerMessage({ type: 'success', text: `Queued Knowledge Graph extraction for "${filename}".` });
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to trigger Knowledge Graph extraction.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackfillGraph = async () => {
    setActionLoading('backfill');
    try {
      const res = await fetch('/api/knowledge-graph/backfill', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed backfill');
      setBannerMessage({ type: 'success', text: json.message || 'Backfill queued successfully.' });
      fetchDocuments();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed Knowledge Graph backfill.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === documents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(documents.map((d) => d.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Document Management & Knowledge Base</h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase ${
                storageProvider.toLowerCase() === 's3'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800'
              }`}
            >
              Storage: {storageProvider}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Manage your document knowledge base, monitor processing pipelines, retry/reprocess documents, and query RAG.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {selectedIds.length > 0 && (
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors"
            >
              🗑 Delete Selected ({selectedIds.length})
            </button>
          )}
          <button
            onClick={handleBackfillGraph}
            disabled={actionLoading === 'backfill'}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors shadow-sm disabled:opacity-50"
            title="Queue Knowledge Graph extraction for all completed documents"
          >
            <span>🕸 Build Knowledge Graph</span>
          </button>
          <button
            onClick={() => fetchDocuments()}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <span>↻ Refresh</span>
          </button>
        </div>
      </div>

      {/* Knowledge Base Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">Total Docs</span>
          <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{stats.totalDocuments}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-mono block">Processing</span>
          <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">{stats.processingDocuments}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono block">Completed</span>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{stats.completedDocuments}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-rose-600 dark:text-rose-400 font-mono block">Failed</span>
          <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono">{stats.failedDocuments}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">Total Pages</span>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-200 font-mono">{stats.totalPages}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono block">Total Chunks</span>
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">{stats.totalChunks}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[11px] text-teal-600 dark:text-teal-400 font-mono block">768d Vectors</span>
          <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 font-mono">{stats.embeddedChunks}</span>
        </div>
      </div>

      {/* Drag and Drop Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
            : 'border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-400 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="max-w-md mx-auto space-y-2 pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 text-xl flex items-center justify-center mx-auto shadow-sm">
            📄
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              <span className="text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and drop PDF file
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              Supported format: PDF • Maximum size: 25 MB • Driver: {storageProvider}
            </p>
          </div>
        </div>

        {isUploading && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-b-2xl border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 mb-1 font-mono">
              <span>Uploading file to {storageProvider.toUpperCase()} Storage...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Banner Alerts */}
      {bannerMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            bannerMessage.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
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

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-sm dark:shadow-xl">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search documents by filename..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300 font-semibold focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="UPLOADING">Uploading</option>
          </select>

          {/* Sort By */}
          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const parts = e.target.value.split(':');
              if (parts[0]) setSortBy(parts[0]);
              if (parts[1]) setSortOrder(parts[1] as 'asc' | 'desc');
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300 font-semibold focus:outline-none focus:border-indigo-500"
          >
            <option value="createdAt:desc">Newest First</option>
            <option value="createdAt:asc">Oldest First</option>
            <option value="filename:asc">Filename A-Z</option>
            <option value="filename:desc">Filename Z-A</option>
            <option value="fileSize:desc">File Size (Largest)</option>
            <option value="status:asc">Status</option>
          </select>

          {/* Page Size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300 font-semibold focus:outline-none focus:border-indigo-500"
          >
            <option value="10">10 per page</option>
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Knowledge Base Documents</h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Showing {documents.length} of {totalItems} total
            </span>
          </div>
          {(debouncedSearch || statusFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setPage(1);
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
            >
              Clear filters ✕
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm font-mono">Loading document catalog from PostgreSQL...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="text-3xl">📭</div>
            {debouncedSearch || statusFilter !== 'ALL' ? (
              <>
                <p className="text-slate-600 dark:text-slate-400 text-sm">No documents match your search filter.</p>
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('ALL');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Reset Filters
                </button>
              </>
            ) : (
              <>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Your knowledge base is currently empty.</p>
                <p className="text-xs text-slate-500">Upload a PDF above to trigger the extraction & pgvector pipeline.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-mono uppercase">
                  <th className="pb-3 w-10">
                    <input
                      type="checkbox"
                      checked={documents.length > 0 && selectedIds.length === documents.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-indigo-600 focus:ring-0"
                    />
                  </th>
                  <th className="pb-3 font-semibold">Document</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold">Pages</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Driver</th>
                  <th className="pb-3 font-semibold">Uploaded</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {documents.map((doc) => {
                  const isSelected = selectedIds.includes(doc.id);
                  const isBusy = actionLoading === doc.id;
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-950/40 group transition-colors ${
                        isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(doc.id)}
                          className="rounded border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-indigo-600 focus:ring-0"
                        />
                      </td>
                      <td className="py-4">
                        <div>
                          <Link
                            href={`/documents/${doc.id}`}
                            className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors block break-all"
                          >
                            {doc.filename}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono block">{doc.id}</span>
                        </div>
                      </td>
                      <td className="py-4 text-slate-700 dark:text-slate-300 font-mono">{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="py-4 text-slate-700 dark:text-slate-300 font-mono">
                        {doc.pageCount ? `${doc.pageCount} pages` : 'Pending'}
                      </td>
                      <td className="py-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${
                              doc.status === 'PROCESSING'
                                ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : doc.status === 'COMPLETED'
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : doc.status === 'FAILED'
                                ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {doc.status === 'PROCESSING' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
                            )}
                            <span>{doc.status}</span>
                          </span>

                          {doc.errorMessage && (
                            <p
                              className="text-[10px] text-rose-600 dark:text-rose-400 font-mono max-w-xs truncate"
                              title={doc.errorMessage}
                            >
                              Error: {doc.errorMessage}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono text-[10px] uppercase border border-slate-200 dark:border-slate-800">
                          {storageProvider}
                        </span>
                      </td>
                      <td className="py-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {new Date(doc.createdAt).toLocaleDateString()}{' '}
                        {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 text-right space-x-1 font-mono">
                        {/* Ask in Chat */}
                        {doc.status === 'COMPLETED' && (
                          <>
                            <button
                              disabled={isBusy}
                              onClick={() => handleExtractGraph(doc.id, doc.filename)}
                              className="px-2.5 py-1 rounded bg-indigo-500/10 dark:bg-[#4d8eff]/10 text-indigo-700 dark:text-[#adc6ff] border border-indigo-200 dark:border-[#4d8eff]/30 hover:bg-indigo-500/20 text-[11px] font-semibold transition-colors disabled:opacity-50"
                              title="Extract Knowledge Graph entities & relationships"
                            >
                              🕸 Extract Graph
                            </button>
                            <Link
                              href="/chat"
                              className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-[11px] font-semibold transition-colors"
                            >
                              💬 Chat
                            </Link>
                          </>
                        )}

                        {/* Download */}
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors"
                        >
                          ⬇ PDF
                        </a>

                        {/* Retry */}
                        {doc.status === 'FAILED' && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleRetry(doc.id, doc.filename)}
                            className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 text-[11px] font-semibold transition-colors disabled:opacity-50"
                          >
                            {isBusy ? 'Retrying...' : '↻ Retry'}
                          </button>
                        )}

                        {/* Reprocess */}
                        {(doc.status === 'COMPLETED' || doc.status === 'FAILED') && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleReprocess(doc.id, doc.filename)}
                            className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors disabled:opacity-50"
                            title="Clear chunks and re-run worker extraction pipeline"
                          >
                            ⚡ Reprocess
                          </button>
                        )}

                        {/* Detail */}
                        <Link
                          href={`/documents/${doc.id}`}
                          className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold transition-colors"
                        >
                          Inspect →
                        </Link>

                        {/* Delete */}
                        <button
                          disabled={isBusy}
                          onClick={() => setDeleteModalTarget({ id: doc.id, filename: doc.filename })}
                          className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
            <div>
              Page {page} of {totalPages} ({totalItems} total documents)
            </div>
            <div className="flex items-center space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Single Delete Confirmation Modal */}
      {deleteModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Document?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">&quot;{deleteModalTarget.filename}&quot;</strong>?
              This will permanently remove the document from <span className="font-mono text-indigo-600 dark:text-indigo-400">{storageProvider.toUpperCase()} Storage</span> and delete all associated page chunks and vector embeddings.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteModalTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSingle}
                disabled={actionLoading === deleteModalTarget.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {actionLoading === deleteModalTarget.id ? 'Deleting...' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <span className="text-2xl">🚨</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete {selectedIds.length} Selected Documents?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
              This action will permanently delete <strong className="text-slate-900 dark:text-white">{selectedIds.length} documents</strong> and all their stored chunks and vector embeddings from storage and database.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={actionLoading === 'bulk'}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {actionLoading === 'bulk' ? 'Deleting Selected...' : 'Delete All Selected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

