'use client';

import { useState, useEffect, useRef } from 'react';
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
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

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
  }, [documents]);

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    // PDF Validation
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Invalid file format. Only PDF files are supported.');
      return;
    }

    // 25MB Max Size
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File size exceeds 25 MB limit.');
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
      setUploadSuccess(`"${file.name}" uploaded successfully! Processing started in background worker.`);
      fetchDocuments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'An error occurred during upload.');
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

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Document Management</h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload PDF documents for page text extraction, token chunking, and 768-dim vector embeddings.
          </p>
        </div>
        <button
          onClick={() => fetchDocuments()}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <span>↻ Refresh List</span>
        </button>
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
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-950/20'
            : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
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

        <div className="max-w-md mx-auto space-y-3 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
            📄
          </div>
          <div>
            <p className="text-base font-semibold text-white">
              <span className="text-indigo-400">Click to upload</span> or drag and drop PDF file
            </p>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Supported format: PDF • Maximum size: 25 MB
            </p>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="absolute inset-x-0 bottom-0 p-4 bg-slate-900/90 backdrop-blur-sm rounded-b-2xl border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5 font-mono">
              <span>Uploading to StorageProvider...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {uploadError && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-rose-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">✅</span>
            <span>{uploadSuccess}</span>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="text-emerald-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Documents List */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold text-white">Uploaded Documents</h2>
          <span className="text-xs font-mono text-slate-400">
            {documents.length} Total Records
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm font-mono">Loading documents from PostgreSQL...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-slate-400 text-sm">No PDF documents uploaded yet.</p>
            <p className="text-xs text-slate-500">Upload a PDF above to trigger the RabbitMQ worker pipeline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 font-mono uppercase">
                  <th className="pb-3 font-semibold">Filename</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold">Page Count</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Uploaded</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-950/40 group">
                    <td className="py-4">
                      <div>
                        <p className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                          {doc.filename}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">{doc.id}</p>
                      </div>
                    </td>
                    <td className="py-4 text-slate-300 font-mono">{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</td>
                    <td className="py-4 text-slate-300 font-mono">
                      {doc.pageCount ? `${doc.pageCount} pages` : 'Pending'}
                    </td>
                    <td className="py-4">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            doc.status === 'PROCESSING'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : doc.status === 'COMPLETED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : doc.status === 'FAILED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {doc.status === 'PROCESSING' && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          )}
                          <span>{doc.status}</span>
                        </span>

                        {doc.errorMessage && (
                          <p className="text-[10px] text-rose-400 font-mono max-w-xs truncate" title={doc.errorMessage}>
                            Error: {doc.errorMessage}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-slate-400 font-mono">
                      {new Date(doc.createdAt).toLocaleDateString()}{' '}
                      {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-4 text-right">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold transition-colors"
                      >
                        <span>Inspect Detail</span>
                        <span>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
