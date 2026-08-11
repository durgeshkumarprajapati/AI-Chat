import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Document AI & RAG Platform
        </h1>
        <p className="text-lg text-slate-300">
          Upload PDF documents, extract vector embeddings, process asynchronous background pipelines, and perform grounded AI questions with citations.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/documents"
          className="p-6 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors"
        >
          <h2 className="text-2xl font-semibold text-white mb-2">Document Management</h2>
          <p className="text-slate-400">
            Upload PDFs, track asynchronous processing status, and manage chunked documents.
          </p>
        </Link>

        <Link
          href="/chat"
          className="p-6 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-colors"
        >
          <h2 className="text-2xl font-semibold text-white mb-2">Interactive AI Chat</h2>
          <p className="text-slate-400">
            Ask questions with pgvector similarity search, Redis caching, and grounded page citations.
          </p>
        </Link>
      </div>
    </div>
  );
}
