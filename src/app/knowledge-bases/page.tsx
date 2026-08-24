'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type KnowledgeBaseItem = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function KnowledgeBasesPage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Modals & Banner state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBaseItem | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchKnowledgeBases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
        sortBy,
        sortOrder
      });
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }

      const res = await fetch(`/api/knowledge-bases?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data.items || []);
        setPagination(json.data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      }
    } catch (err) {
      console.error('Failed to fetch knowledge bases:', err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  const handleCreate = async () => {
    if (!nameInput.trim()) {
      setBannerMessage({ type: 'error', text: 'Knowledge base name is required.' });
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim(), description: descInput.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to create Knowledge Base');
      }
      setBannerMessage({ type: 'success', text: `Knowledge Base "${json.data.name}" created successfully!` });
      setIsCreateModalOpen(false);
      setNameInput('');
      setDescInput('');
      fetchKnowledgeBases();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedKb || !nameInput.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/knowledge-bases/${selectedKb.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim(), description: descInput.trim() })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to update Knowledge Base');
      }
      setBannerMessage({ type: 'success', text: `Knowledge Base updated successfully.` });
      setIsEditModalOpen(false);
      setSelectedKb(null);
      fetchKnowledgeBases();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedKb) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/knowledge-bases/${selectedKb.id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to delete Knowledge Base');
      }
      setBannerMessage({ type: 'success', text: `Knowledge Base deleted. Member documents remain intact.` });
      setIsDeleteModalOpen(false);
      setSelectedKb(null);
      fetchKnowledgeBases();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Knowledge Bases & Collections</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Organize documents into reusable collections to scope RAG search, citations, and grounded answers.
          </p>
        </div>

        <button
          onClick={() => {
            setNameInput('');
            setDescInput('');
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/20 transition-all"
        >
          <span>+ New Knowledge Base</span>
        </button>
      </div>

      {/* Banner Feedback Alert */}
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

      {/* Toolbar Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-lg text-xs">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search knowledge bases by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 pl-9 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
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
            <option value="name:asc">Name (A-Z)</option>
            <option value="name:desc">Name (Z-A)</option>
          </select>
        </div>
      </div>

      {/* Knowledge Base Grid Catalog */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 font-mono text-xs">Loading Knowledge Bases...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <span className="text-4xl">📚</span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Knowledge Bases Found</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            {debouncedSearch
              ? `No collections matched "${debouncedSearch}". Try a different search term.`
              : 'Create your first Knowledge Base collection to group documents and scope RAG retrieval.'}
          </p>
          {!debouncedSearch && (
            <button
              onClick={() => {
                setNameInput('');
                setDescInput('');
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
            >
              + Create Knowledge Base
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((kb) => (
            <div
              key={kb.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 p-6 flex flex-col justify-between space-y-5 shadow-sm dark:shadow-xl transition-all hover:shadow-md dark:hover:shadow-2xl dark:hover:shadow-indigo-950/20 group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">📚</span>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {kb.name}
                    </h2>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setSelectedKb(kb);
                        setNameInput(kb.name);
                        setDescInput(kb.description || '');
                        setIsEditModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Edit Knowledge Base"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        setSelectedKb(kb);
                        setIsDeleteModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Delete Knowledge Base"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 min-h-[36px] line-clamp-2">
                  {kb.description || 'No description provided.'}
                </p>
              </div>

              {/* Metrics Pills */}
              <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Documents</span>
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{kb.documentCount}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Completed</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{kb.completedDocuments}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Chunks</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">{kb.totalChunks}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Link
                    href={`/chat?knowledgeBaseId=${kb.id}`}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <span>💬 Chat in Scope</span>
                  </Link>

                  <Link
                    href={`/knowledge-bases/${kb.id}`}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 text-slate-800 dark:text-white hover:text-white text-xs font-semibold transition-all"
                  >
                    Manage KB →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-6 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Showing Page <strong className="text-slate-900 dark:text-slate-200">{pagination.page}</strong> of{' '}
            <strong className="text-slate-900 dark:text-slate-200">{pagination.totalPages}</strong> ({pagination.total} total)
          </div>
          <div className="flex items-center space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Create KB Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Knowledge Base</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Knowledge Base Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Technical Documentation"
                  maxLength={100}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Description (Optional)</label>
                <textarea
                  placeholder="e.g. Architecture specs, API guides, and system manuals"
                  rows={3}
                  maxLength={500}
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={actionLoading || !nameInput.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Creating...' : 'Create Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit KB Modal */}
      {isEditModalOpen && selectedKb && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Knowledge Base</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Knowledge Base Name *</label>
                <input
                  type="text"
                  maxLength={100}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">Description</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={actionLoading || !nameInput.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedKb && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Knowledge Base?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">&quot;{selectedKb.name}&quot;</strong>?
              This will remove the collection grouping. <strong className="text-emerald-600 dark:text-emerald-400">All member documents, vector embeddings, chunks, and storage files will remain completely intact.</strong>
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete Knowledge Base'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

