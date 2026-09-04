'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewResearchPage() {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [title, setTitle] = useState('');
  const [researchMode, setResearchMode] = useState<string>('STANDARD');
  const [sourceMode, setSourceMode] = useState<string>('AUTO');

  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [externalWebEnabled, setExternalWebEnabled] = useState<boolean>(true);

  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadResources() {
      try {
        const [kbRes, docRes] = await Promise.all([
          fetch('/api/knowledge-bases'),
          fetch('/api/documents')
        ]);

        const kbData = await kbRes.json();
        const docData = await docRes.json();

        if (kbData.success) {
          const kbList = Array.isArray(kbData.data)
            ? kbData.data
            : Array.isArray(kbData.data?.items)
            ? kbData.data.items
            : [];
          setKnowledgeBases(kbList);
        }

        if (docData.success) {
          const docList = Array.isArray(docData.data)
            ? docData.data
            : Array.isArray(docData.data?.documents)
            ? docData.data.documents
            : Array.isArray(docData.data?.items)
            ? docData.data.items
            : [];
          setDocuments(docList);
        }
      } catch (err) {
        console.error('Failed to load user resources:', err);
      }
    }
    loadResources();
  }, []);

  const handleStartResearch = async () => {
    if (!question.trim()) {
      setErrorMsg('Please enter a research question.');
      return;
    }

    setErrorMsg(null);
    setCreating(true);

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          question: question.trim(),
          researchMode,
          sourceMode,
          knowledgeBaseId: selectedKbId || undefined,
          documentIds: selectedDocIds,
          externalWebEnabled
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create research session');
      }

      // Trigger background research execution asynchronously
      fetch(`/api/research/${data.data.id}/start`, { method: 'POST' }).catch((err) =>
        console.error('Background research trigger error:', err)
      );

      router.push(`/research/${data.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while creating research');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🤖</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Start Agentic Research</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Configure research depth, select permitted evidence sources, and trigger autonomous investigation.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-semibold">
          {errorMsg}
        </div>
      )}

      <div className="space-y-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        {/* Research Question */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            What would you like me to research? <span className="text-indigo-400">*</span>
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. Compare PostgreSQL and MongoDB for a high-scale SaaS application with multi-tenant isolation."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none"
          />
        </div>

        {/* Optional Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Research Title (Optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. PostgreSQL vs MongoDB SaaS Comparison"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Research Depth Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Research Depth</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'QUICK', name: 'Quick', desc: '3 Searches, 5 Sources' },
              { id: 'STANDARD', name: 'Standard', desc: '6 Searches, 10 Sources' },
              { id: 'DEEP', name: 'Deep', desc: '8 Searches, 12 Sources' }
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setResearchMode(mode.id)}
                className={`p-3 rounded-xl border text-left transition ${
                  researchMode === mode.id
                    ? 'bg-indigo-600/20 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white">{mode.name}</div>
                <div className="text-[10px] text-slate-400 mt-1">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Source Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Source Mode</label>
            <select
              value={sourceMode}
              onChange={(e) => setSourceMode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="AUTO">Auto (Smart Selection)</option>
              <option value="ALL_SOURCES">All Permitted Sources</option>
              <option value="DOCUMENTS_ONLY">Documents Only</option>
              <option value="WEB_ONLY">Web Search Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Knowledge Base</label>
            <select
              value={selectedKbId}
              onChange={(e) => setSelectedKbId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="">None / All Authorized KBs</option>
              {(Array.isArray(knowledgeBases) ? knowledgeBases : []).map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents Multi-Select */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Select Documents</label>
          <div className="max-h-32 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
            {!Array.isArray(documents) || documents.length === 0 ? (
              <p className="text-[11px] text-slate-500">No uploaded documents found.</p>
            ) : (
              (Array.isArray(documents) ? documents : []).map((doc) => (
                <label key={doc.id} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedDocIds([...selectedDocIds, doc.id]);
                      else setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.id));
                    }}
                    className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{doc.filename}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Web Switch */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <div className="text-xs font-semibold text-white">Live Web Evidence</div>
            <div className="text-[11px] text-slate-400">Allow agent to search live web sources with SSRF protection</div>
          </div>
          <button
            type="button"
            onClick={() => setExternalWebEnabled(!externalWebEnabled)}
            className={`w-12 h-6 rounded-full p-1 transition ${externalWebEnabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition ${externalWebEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Start Button */}
        <button
          type="button"
          onClick={handleStartResearch}
          disabled={creating}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-xs transition shadow-lg shadow-indigo-500/25"
        >
          {creating ? 'Initializing Agentic Research...' : '🤖 Start Autonomous Research'}
        </button>
      </div>
    </div>
  );
}
