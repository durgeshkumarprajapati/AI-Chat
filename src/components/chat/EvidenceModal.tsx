'use client';

import React from 'react';
import Link from 'next/link';
import { Citation } from '@/features/rag/chat/chat.types';

interface EvidenceModalProps {
  citation: Citation | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({ citation, isOpen, onClose }) => {
  if (!isOpen || !citation) return null;

  const confidenceColor =
    citation.confidenceLabel === 'Strong'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : citation.confidenceLabel === 'Moderate'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-slate-500/10 text-slate-400 border-slate-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-xl w-full p-6 text-slate-100 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 font-bold text-sm border border-indigo-500/30">
              [{citation.index || 1}]
            </span>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg leading-tight truncate max-w-[320px]">
                {citation.filename}
              </h3>
              <p className="text-xs text-slate-400">
                Page {citation.pageNumber || 1} &bull; Document Chunk Evidence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close Evidence Modal"
          >
            ✕
          </button>
        </div>

        {/* Metadata Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className={`p-2.5 rounded-lg border text-center ${confidenceColor}`}>
            <span className="block text-[10px] uppercase font-bold tracking-wider opacity-75">Evidence Strength</span>
            <span className="font-semibold text-sm">{citation.confidenceLabel || 'Strong'}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-800/40 text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Similarity</span>
            <span className="font-semibold text-sm text-indigo-400">{citation.similarity ? (citation.similarity * 100).toFixed(1) + '%' : 'N/A'}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-800/40 text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Rerank Score</span>
            <span className="font-semibold text-sm text-cyan-400">{citation.rerankScore ? citation.rerankScore.toFixed(3) : 'N/A'}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-800/40 text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Retrieval Source</span>
            <span className="font-semibold text-sm capitalize text-slate-300">{citation.sourceType || 'Hybrid'}</span>
          </div>
        </div>

        {/* Exact Evidence Snippet */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Retrieved Document Evidence Snippet
          </label>
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
            {citation.evidenceSnippet || 'No evidence snippet available.'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 italic">
            &bull; Evidence text is extracted directly from the verified document chunk.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Close
          </button>
          <Link
            href={`/documents/${citation.documentId}?page=${citation.pageNumber || 1}`}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-1.5"
          >
            Open Document Page ↗
          </Link>
        </div>
      </div>
    </div>
  );
};
