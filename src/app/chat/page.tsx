import Link from 'next/link';

export default function ChatPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 space-y-8">
      {/* Locked Feature Banner */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 text-3xl flex items-center justify-center mx-auto shadow-inner">
          💬
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-xs font-semibold">
            <span>🔒 Locked Architectural Stage</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Interactive AI RAG Chat</h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Semantic query vector retrieval, grounded prompt generation, and citation answering will be implemented in <strong className="text-indigo-400">Phase 11</strong>.
          </p>
        </div>

        {/* Phase 11 Architecture Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-xl mx-auto pt-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-xs font-bold text-indigo-400">1. pgvector Search</span>
            <p className="text-xs text-slate-400">Cosine similarity retrieval using the HNSW index on vector(768).</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-xs font-bold text-indigo-400">2. Top-K Context Reranking</span>
            <p className="text-xs text-slate-400">Retrieve top-K relevant chunks with exact page number tracking.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-xs font-bold text-indigo-400">3. Redis Semantic Cache</span>
            <p className="text-xs text-slate-400">Cache frequent query embeddings and responses for low latency.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-xs font-bold text-indigo-400">4. LLM Grounded Answers</span>
            <p className="text-xs text-slate-400">OpenAI chat completions with precise page & document citations.</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800/80 flex justify-center space-x-4">
          <Link
            href="/documents"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all"
          >
            ← Manage & Upload Documents
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            View Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
