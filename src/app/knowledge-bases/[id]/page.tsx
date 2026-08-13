'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type KnowledgeBaseDetail = {
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

type MemberDocument = {
  id: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  status: string;
  pageCount: number;
  errorMessage?: string | null;
  addedAt: string;
  createdAt: string;
  updatedAt: string;
};

type UserDocumentOption = {
  id: string;
  filename: string;
  status: string;
  fileSize: number;
  isMember: boolean;
};

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const kbId = params.id as string;

  const [kb, setKb] = useState<KnowledgeBaseDetail | null>(null);
  const [memberDocs, setMemberDocs] = useState<MemberDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Document Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userDocOptions, setUserDocOptions] = useState<UserDocumentOption[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const [kbRes, docsRes] = await Promise.all([
        fetch(`/api/knowledge-bases/${kbId}`).then((r) => r.json()),
        fetch(`/api/knowledge-bases/${kbId}/documents`).then((r) => r.json())
      ]);

      if (kbRes.success) setKb(kbRes.data);
      if (docsRes.success) setMemberDocs(docsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch KB details:', err);
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const fetchUserDocumentsForPicker = async () => {
    setModalLoading(true);
    try {
      const res = await fetch('/api/documents?pageSize=100');
      const json = await res.json();
      if (json.success) {
        const allDocs = Array.isArray(json.data) ? json.data : json.data.items || [];
        const memberMap = new Set(memberDocs.map((m) => m.id));

        const options: UserDocumentOption[] = allDocs.map((d: { id: string; filename: string; status: string; fileSize: number }) => ({
          id: d.id,
          filename: d.filename,
          status: d.status,
          fileSize: d.fileSize,
          isMember: memberMap.has(d.id)
        }));

        setUserDocOptions(options);
      }
    } catch (err) {
      console.error('Failed to fetch user documents for picker:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddDocumentsSubmit = async () => {
    if (selectedDocIds.length === 0) return;
    setActionLoading(true);
    try {
      let addedCount = 0;
      for (const docId of selectedDocIds) {
        const res = await fetch(`/api/knowledge-bases/${kbId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: docId })
        });
        if (res.ok) addedCount++;
      }
      setBannerMessage({ type: 'success', text: `Added ${addedCount} document(s) to Knowledge Base.` });
      setIsAddModalOpen(false);
      setSelectedDocIds([]);
      fetchDetail();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add documents.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (documentId: string, filename: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/documents/${documentId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to remove document');
      }
      setBannerMessage({ type: 'success', text: `Removed "${filename}" from Knowledge Base. Document file remains intact.` });
      fetchDetail();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove document.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setBannerMessage({ type: 'error', text: 'Only PDF files are supported.' });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // 1. Upload document using canonical endpoint
      const uploadRes = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success) {
        throw new Error(uploadJson.error?.message || 'Upload failed');
      }

      const uploadedDocId = uploadJson.data.id;

      // 2. Associate uploaded document with current KB
      await fetch(`/api/knowledge-bases/${kbId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: uploadedDocId })
      });

      setBannerMessage({ type: 'success', text: `Uploaded "${file.name}" into Knowledge Base. Processing enqueued.` });
      fetchDetail();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center text-slate-400 font-mono text-xs">
        Loading Knowledge Base details...
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center space-y-4">
        <p className="text-rose-400 font-semibold text-sm">Knowledge Base not found or access denied.</p>
        <Link href="/knowledge-bases" className="inline-block px-4 py-2 rounded-lg bg-slate-800 text-indigo-400 text-xs font-semibold">
          ← Back to Knowledge Bases
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <Link href="/knowledge-bases" className="text-slate-400 hover:text-white text-sm">
              ← Knowledge Bases
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-mono text-slate-400">{kb.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">{kb.name}</h1>
          {kb.description && <p className="text-xs text-slate-400 mt-1">{kb.description}</p>}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/chat?knowledgeBaseId=${kb.id}`}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/30 transition-all flex items-center space-x-1.5"
          >
            <span>💬 Chat in Scope</span>
          </Link>

          <button
            onClick={() => {
              fetchUserDocumentsForPicker();
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors"
          >
            + Add Existing Docs
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDirectUpload}
            accept=".pdf,application/pdf"
            className="hidden"
          />
          <button
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : '📤 Upload PDF to KB'}
          </button>
        </div>
      </div>

      {/* Banner Feedback Alert */}
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

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-1">
          <span className="text-slate-500 block text-[11px]">Total Documents</span>
          <span className="text-2xl font-bold text-white">{kb.documentCount}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-1">
          <span className="text-slate-500 block text-[11px]">Completed & Ready</span>
          <span className="text-2xl font-bold text-emerald-400">{kb.completedDocuments}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-1">
          <span className="text-slate-500 block text-[11px]">Processing / Failed</span>
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-amber-400">{kb.processingDocuments}</span>
            {kb.failedDocuments > 0 && (
              <span className="text-xs text-rose-400">({kb.failedDocuments} failed)</span>
            )}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-1">
          <span className="text-slate-500 block text-[11px]">Vector Chunks</span>
          <span className="text-2xl font-bold text-indigo-400">{kb.totalChunks}</span>
        </div>
      </div>

      {/* Member Documents Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Member Documents</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Documents currently associated with this collection for scoped hybrid vector retrieval.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
            {memberDocs.length} Members
          </span>
        </div>

        {memberDocs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs font-mono space-y-3">
            <p>No documents added to this Knowledge Base yet.</p>
            <button
              onClick={() => {
                fetchUserDocumentsForPicker();
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold"
            >
              + Add Existing Documents
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 font-mono uppercase">
                  <th className="pb-3 font-semibold">Filename</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold">Pages</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Added Date</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {memberDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-950/40">
                    <td className="py-3 font-medium text-white max-w-[220px] truncate">
                      <Link href={`/documents/${doc.id}`} className="hover:text-indigo-400 transition-colors">
                        {doc.filename}
                      </Link>
                    </td>
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
                    <td className="py-3 text-slate-400 font-mono">{new Date(doc.addedAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right space-x-2">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-slate-400 hover:text-white font-medium"
                      >
                        Inspect
                      </Link>
                      <button
                        disabled={actionLoading}
                        onClick={() => handleRemoveMember(doc.id, doc.filename)}
                        className="text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Document Picker Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Add Documents to Collection</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>

            {modalLoading ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">Loading available documents...</div>
            ) : userDocOptions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">No documents available in your account.</div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {userDocOptions.map((doc) => (
                  <label
                    key={doc.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      doc.isMember
                        ? 'bg-slate-950/40 border-slate-800/40 opacity-60 cursor-not-allowed'
                        : selectedDocIds.includes(doc.id)
                        ? 'bg-indigo-950/60 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3 max-w-[300px] truncate">
                      <input
                        type="checkbox"
                        disabled={doc.isMember}
                        checked={doc.isMember || selectedDocIds.includes(doc.id)}
                        onChange={(e) => {
                          if (doc.isMember) return;
                          if (e.target.checked) {
                            setSelectedDocIds((prev) => [...prev, doc.id]);
                          } else {
                            setSelectedDocIds((prev) => prev.filter((id) => id !== doc.id));
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                      />
                      <span className="truncate font-medium">{doc.filename}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          doc.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {doc.status}
                      </span>
                      {doc.isMember && <span className="text-[10px] font-mono text-slate-500">Already Added</span>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400">{selectedDocIds.length} document(s) selected</span>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDocumentsSubmit}
                  disabled={actionLoading || selectedDocIds.length === 0}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Adding...' : 'Add Selected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
