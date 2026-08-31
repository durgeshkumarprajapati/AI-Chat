'use client';

import { useState, useEffect } from 'react';
import { GroupConversationDetailsDTO } from '@/features/rag/collaboration/group-rag.types';

interface GroupSettingsModalProps {
  isOpen: boolean;
  group: GroupConversationDetailsDTO | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function GroupSettingsModal({ isOpen, group, onClose, onUpdated }: GroupSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'sources' | 'general'>('members');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');

  // Member management state
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedAddUserId, setSelectedAddUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');

  // Source management state
  const [availableDocs, setAvailableDocs] = useState<any[]>([]);
  const [availableKbs, setAvailableKbs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [selectedKbId, setSelectedKbId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && group) {
      setTitle(group.title);
      setSummary(group.summary || '');
      setError(null);
      fetchOptions();
    }
  }, [isOpen, group]);

  const fetchOptions = async () => {
    try {
      const [uRes, dRes, kRes] = await Promise.all([
        fetch('/api/collaboration/users/search'),
        fetch('/api/documents'),
        fetch('/api/knowledge-bases')
      ]);
      if (uRes.ok) {
        const d = await uRes.json();
        setAvailableUsers(d.data || []);
      }
      if (dRes.ok) {
        const d = await dRes.json();
        setAvailableDocs(d.data?.documents || d.data || []);
      }
      if (kRes.ok) {
        const d = await kRes.json();
        setAvailableKbs(d.data?.knowledgeBases || d.data || []);
      }
    } catch {
      // Ignore background option loading errors
    }
  };

  if (!isOpen || !group) return null;

  const isOwner = group.userRole === 'OWNER';
  const canEdit = isOwner || group.userRole === 'EDITOR';

  const handleUpdateGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to update group');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedAddUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedAddUserId, role: selectedRole })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to add member');
      setSelectedAddUserId('');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/members/${memberUserId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to remove member');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocSource = async () => {
    if (!selectedDocId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/sources/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedDocId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to add document source');
      setSelectedDocId('');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDocSource = async (sourceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/sources/documents/${sourceId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to remove source');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKbSource = async () => {
    if (!selectedKbId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/sources/knowledge-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId: selectedKbId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to add Knowledge Base source');
      setSelectedKbId('');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveKbSource = async (sourceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}/sources/knowledge-bases/${sourceId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to remove source');
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Are you sure you want to delete this group conversation? This cannot be undone.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rag/conversations/${group.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to delete group');
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-border flex justify-between items-center bg-background/50">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              ⚙️ Manage Workspace: <span className="text-indigo-400">{group.title}</span>
            </h2>
            <p className="text-xs text-muted-foreground">Your role: <span className="text-indigo-300 font-semibold">{group.userRole}</span></p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-background/30 px-4 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'members'
                ? 'bg-surface-hover text-indigo-400 border-t-2 border-indigo-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            👥 Members ({group.members.length})
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'sources'
                ? 'bg-surface-hover text-indigo-400 border-t-2 border-indigo-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📚 RAG Sources ({group.documentSources.length + group.knowledgeBaseSources.length})
          </button>
          {canEdit && (
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
                activeTab === 'general'
                  ? 'bg-surface-hover text-indigo-400 border-t-2 border-indigo-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ⚙️ Settings
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="p-3 bg-background/40 border border-border rounded-lg flex items-center gap-2">
                  <select
                    value={selectedAddUserId}
                    onChange={(e) => setSelectedAddUserId(e.target.value)}
                    className="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
                  >
                    <option value="">-- Select Member to Add --</option>
                    {availableUsers
                      .filter((u) => !group.members.some((m) => m.userId === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email}
                        </option>
                      ))}
                  </select>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as any)}
                    className="bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
                  >
                    <option value="EDITOR">EDITOR</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!selectedAddUserId || loading}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="divide-y divide-slate-800 border border-border rounded-lg overflow-hidden bg-background/20">
                {group.members.map((m) => (
                  <div key={m.id} className="p-3 flex items-center justify-between hover:bg-surface-hover/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-xs">
                        {((m.user?.name || m.user?.email || 'U'))[0]!.toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{m.user?.name || m.user?.email}</div>
                        <div className="text-xs text-muted-foreground">{m.user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-surface-hover text-indigo-300 font-mono">
                        {m.role}
                      </span>
                      {canEdit && m.role !== 'OWNER' && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources Tab */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              {/* Document Sources */}
              <div>
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Attached Documents ({group.documentSources.length})
                </h3>

                {canEdit && (
                  <div className="p-3 bg-background/40 border border-border rounded-lg flex items-center gap-2 mb-3">
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="">-- Attach Document --</option>
                      {availableDocs
                        .filter((d) => !group.documentSources.some((ds) => ds.documentId === d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            📄 {d.filename}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={handleAddDocSource}
                      disabled={!selectedDocId || loading}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold rounded-lg disabled:opacity-50"
                    >
                      Attach
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {group.documentSources.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No documents attached.</p>
                  ) : (
                    group.documentSources.map((ds) => (
                      <div key={ds.id} className="p-2.5 bg-background/30 border border-border rounded-lg flex justify-between items-center text-xs text-foreground">
                        <span>📄 {ds.document.filename} <span className="text-muted-foreground">(added by {ds.addedBy.name || ds.addedBy.email})</span></span>
                        {canEdit && (
                          <button onClick={() => handleRemoveDocSource(ds.id)} className="text-red-400 hover:text-red-300">
                            Detach
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* KB Sources */}
              <div>
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Attached Knowledge Bases ({group.knowledgeBaseSources.length})
                </h3>

                {canEdit && (
                  <div className="p-3 bg-background/40 border border-border rounded-lg flex items-center gap-2 mb-3">
                    <select
                      value={selectedKbId}
                      onChange={(e) => setSelectedKbId(e.target.value)}
                      className="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
                    >
                      <option value="">-- Attach Knowledge Base --</option>
                      {availableKbs
                        .filter((k) => !group.knowledgeBaseSources.some((ks) => ks.knowledgeBaseId === k.id))
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            📚 {k.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={handleAddKbSource}
                      disabled={!selectedKbId || loading}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold rounded-lg disabled:opacity-50"
                    >
                      Attach
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {group.knowledgeBaseSources.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No Knowledge Bases attached.</p>
                  ) : (
                    group.knowledgeBaseSources.map((ks) => (
                      <div key={ks.id} className="p-2.5 bg-background/30 border border-border rounded-lg flex justify-between items-center text-xs text-foreground">
                        <span>📚 {ks.knowledgeBase.name} <span className="text-muted-foreground">(added by {ks.addedBy.name || ks.addedBy.email})</span></span>
                        {canEdit && (
                          <button onClick={() => handleRemoveKbSource(ks.id)} className="text-red-400 hover:text-red-300">
                            Detach
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* General Tab */}
          {activeTab === 'general' && canEdit && (
            <form onSubmit={handleUpdateGeneral} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Description / Goal
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border">
                {isOwner ? (
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 text-xs font-semibold rounded-lg"
                  >
                    Delete Group Workspace
                  </button>
                ) : <div />}

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground text-sm font-semibold rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
