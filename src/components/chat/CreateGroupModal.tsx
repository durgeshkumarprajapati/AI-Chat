'use client';

import { useState, useEffect } from 'react';

interface UserOption {
  id: string;
  email: string;
  name?: string | null;
  fullName?: string | null;
}

interface DocOption {
  id: string;
  filename: string;
}

interface KbOption {
  id: string;
  name: string;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (_group: any) => void;
}

export function CreateGroupModal({ isOpen, onClose, onSuccess }: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [documents, setDocuments] = useState<DocOption[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KbOption[]>([]);

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSummary('');
      setSelectedUserIds([]);
      setSelectedDocIds([]);
      setSelectedKbIds([]);
      setError(null);
      fetchOptions();
    }
  }, [isOpen]);

  const fetchOptions = async () => {
    try {
      const [usersRes, docsRes, kbsRes] = await Promise.all([
        fetch('/api/collaboration/users/search'),
        fetch('/api/documents'),
        fetch('/api/knowledge-bases')
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.data || []);
      }
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.data?.documents || data.data || []);
      }
      if (kbsRes.ok) {
        const data = await kbsRes.json();
        setKnowledgeBases(data.data?.knowledgeBases || data.data || []);
      }
    } catch {
      // Ignore background option load errors
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Group title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rag/conversations/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || undefined,
          memberUserIds: selectedUserIds,
          documentSourceIds: selectedDocIds,
          knowledgeBaseSourceIds: selectedKbIds
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to create group');
      }

      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating group');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400">👥</span> Create Group RAG Workspace
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Group Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Architecture & Design Team"
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Description / Goal (Optional)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description of the group's RAG knowledge scope"
              rows={2}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm resize-none"
            />
          </div>

          {/* Members Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Add Initial Members
            </label>
            <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-lg p-2 bg-slate-950/30 space-y-1">
              {users.length === 0 ? (
                <p className="text-xs text-slate-500 p-1">No additional workspace members found.</p>
              ) : (
                users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-800/50 rounded cursor-pointer text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleSelection(selectedUserIds, setSelectedUserIds, u.id)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{u.name || u.fullName || u.email}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Document Sources Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Attach Initial Documents
            </label>
            <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-lg p-2 bg-slate-950/30 space-y-1">
              {documents.length === 0 ? (
                <p className="text-xs text-slate-500 p-1">No uploaded documents available.</p>
              ) : (
                documents.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-800/50 rounded cursor-pointer text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(d.id)}
                      onChange={() => toggleSelection(selectedDocIds, setSelectedDocIds, d.id)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="truncate">📄 {d.filename}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* KB Sources Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Attach Initial Knowledge Bases
            </label>
            <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-lg p-2 bg-slate-950/30 space-y-1">
              {knowledgeBases.length === 0 ? (
                <p className="text-xs text-slate-500 p-1">No Knowledge Bases available.</p>
              ) : (
                knowledgeBases.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-800/50 rounded cursor-pointer text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedKbIds.includes(k.id)}
                      onChange={() => toggleSelection(selectedKbIds, setSelectedKbIds, k.id)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="truncate">📚 {k.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-semibold shadow-lg shadow-indigo-600/20"
            >
              {loading ? 'Creating...' : 'Create Group Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
