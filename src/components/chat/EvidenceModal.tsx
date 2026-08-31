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
      ? 'bg-success/10 text-success border-success/30'
      : citation.confidenceLabel === 'Moderate'
      ? 'bg-warning/10 text-warning border-warning/30'
      : 'bg-muted text-muted-foreground border-border';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-xl w-full p-6 text-foreground relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-accent-foreground font-bold text-sm border border-primary/30">
              [{citation.index || 1}]
            </span>
            <div>
              <h3 className="font-semibold text-foreground text-lg leading-tight truncate max-w-[320px]">
                {citation.filename}
              </h3>
              <p className="text-xs text-muted-foreground">
                Page {citation.pageNumber || 1} &bull; Document Chunk Evidence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-surface-hover transition-colors duration-150"
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
          <div className="p-2.5 rounded-lg border border-border bg-muted text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Similarity</span>
            <span className="font-semibold text-sm text-primary">{citation.similarity ? (citation.similarity * 100).toFixed(1) + '%' : 'N/A'}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-border bg-muted text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Rerank Score</span>
            <span className="font-semibold text-sm text-info">{citation.rerankScore ? citation.rerankScore.toFixed(3) : 'N/A'}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-border bg-muted text-center">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Retrieval Source</span>
            <span className="font-semibold text-sm capitalize text-foreground">{citation.sourceType || 'Hybrid'}</span>
          </div>
        </div>

        {/* Exact Evidence Snippet */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Retrieved Document Evidence Snippet
          </label>
          <div className="p-4 rounded-lg bg-background border border-border font-mono text-xs text-muted-foreground leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
            {citation.evidenceSnippet || 'No evidence snippet available.'}
          </div>
          <p className="text-[11px] text-text-disabled mt-1.5 italic">
            &bull; Evidence text is extracted directly from the verified document chunk.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Close
          </button>
          <Link
            href={`/documents/${citation.documentId}?page=${citation.pageNumber || 1}`}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-colors duration-150 shadow-lg shadow-primary/20 flex items-center gap-1.5"
          >
            Open Document Page ↗
          </Link>
        </div>
      </div>
    </div>
  );
};
