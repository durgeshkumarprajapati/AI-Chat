'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FOCUS_RING, SURFACE, TRANSITION } from '@/lib/design-system/theme.constants';
import {
  CONFIDENCE_BAND_BADGE_VARIANT,
  ENTITY_TYPE_BADGE_VARIANT,
  STATUS_BADGE_VARIANT,
  formatConfidencePercent,
  type AskAboutNodeResult,
  type ExplorerNodeDetailDTO
} from './explorer.types';

export interface NodeDetailsPanelProps {
  selectedNodeIds: string[];
  detail: ExplorerNodeDetailDTO | null;
  loading: boolean;
  error: string | null;
  onRetryDetail: () => void;
  onClearSelection: () => void;
  onSelectNode: (_nodeId: string) => void;

  expandLoading: boolean;
  onExpand: (_nodeId: string) => void;

  askLoading: boolean;
  askResult: AskAboutNodeResult | null;
  askError: string | null;
  onAskSubmit: (_question: string) => void;

  explainLoading: boolean;
  onExplainRelationship: () => void;
}

const DEFAULT_QUESTION = 'Explain this in context';

export default function NodeDetailsPanel({
  selectedNodeIds,
  detail,
  loading,
  error,
  onRetryDetail,
  onClearSelection,
  onSelectNode,
  expandLoading,
  onExpand,
  askLoading,
  askResult,
  askError,
  onAskSubmit,
  explainLoading,
  onExplainRelationship
}: NodeDetailsPanelProps) {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);

  if (selectedNodeIds.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <span className="text-2xl block" aria-hidden="true">👆</span>
        <p className="text-xs font-semibold text-foreground">No node selected</p>
        <p className="text-[11px] text-muted-foreground max-w-[220px] mx-auto">
          Click any node in the graph to inspect its details, evidence, and relationships. Shift-click a second node to compare them.
        </p>
      </div>
    );
  }

  if (selectedNodeIds.length === 2) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-foreground">2 nodes selected</h4>
          <button
            type="button"
            onClick={onClearSelection}
            className={`text-[11px] text-muted-foreground hover:text-foreground ${TRANSITION.base} ${FOCUS_RING} rounded`}
          >
            Clear
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Ask the AI to explain how these two entities are connected, grounded in the supporting document evidence.
        </p>
        <Button variant="primary" size="sm" className="w-full" onClick={onExplainRelationship} loading={explainLoading}>
          Explain Relationship
        </Button>
      </div>
    );
  }

  // Exactly one node selected.
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading node details">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-16 w-full rounded-xl bg-muted" />
        <div className="h-16 w-full rounded-xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 text-center py-6">
        <p className="text-xs font-semibold text-destructive">Couldn&apos;t load node details</p>
        <p className="text-[11px] text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetryDetail}>Retry</Button>
      </div>
    );
  }

  if (!detail) return null;

  const entityBadgeVariant = ENTITY_TYPE_BADGE_VARIANT[detail.entityType] || 'neutral';
  const statusBadgeVariant = STATUS_BADGE_VARIANT[detail.status] || 'neutral';

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={entityBadgeVariant}>{detail.entityType}</Badge>
          <Badge variant={CONFIDENCE_BAND_BADGE_VARIANT[detail.confidenceBand]}>{formatConfidencePercent(detail.confidence)}</Badge>
          <Badge variant={statusBadgeVariant}>{detail.status}</Badge>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Clear selection"
          className={`text-muted-foreground hover:text-foreground text-xs ${TRANSITION.base} ${FOCUS_RING} rounded`}
        >
          ✕
        </button>
      </div>

      <div>
        <h4 className="text-base font-extrabold text-foreground leading-snug">{detail.canonicalName}</h4>
        {detail.aliases.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Also known as: {detail.aliases.join(', ')}
          </p>
        )}
      </div>

      {detail.description && (
        <p className="leading-relaxed text-foreground/90 border border-border rounded-xl p-3 bg-muted/40">{detail.description}</p>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Updated {new Date(detail.updatedAt).toLocaleDateString()}</span>
        <span>{detail.relatedDocumentCount} source doc{detail.relatedDocumentCount === 1 ? '' : 's'}</span>
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={() => onExpand(detail.id)} loading={expandLoading}>
        Expand Neighbors
      </Button>

      {/* Evidence */}
      <div className="space-y-2">
        <h5 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Evidence</h5>
        {!detail.evidenceAvailable || detail.evidence.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No document evidence available for this entity.</p>
        ) : (
          <ul className="space-y-2">
            {detail.evidence.map((ev, idx) => (
              <li key={`${ev.chunkId}-${idx}`} className={`${SURFACE.card} rounded-xl p-2.5 space-y-1.5`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground truncate" title={ev.documentName}>{ev.documentName}</span>
                  {ev.pageNumber !== null && (
                    <span className="text-[10px] text-muted-foreground shrink-0">p.{ev.pageNumber}</span>
                  )}
                </div>
                {ev.snippet && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">&ldquo;{ev.snippet}&rdquo;</p>}
                <Link href={`/documents/${ev.documentId}`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">Open Document</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Relationships */}
      <div className="space-y-2">
        <h5 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Relationships ({detail.relationships.length})
        </h5>
        {detail.relationships.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No relationships found for this entity.</p>
        ) : (
          <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            {detail.relationships.map((rel) => (
              <li key={rel.edge.id}>
                <button
                  type="button"
                  onClick={() => onSelectNode(rel.neighborNodeId)}
                  className={`w-full flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left hover:border-primary/40 hover:bg-accent ${TRANSITION.base} ${FOCUS_RING}`}
                >
                  <span className="text-muted-foreground shrink-0" aria-hidden="true">
                    {rel.direction === 'OUTGOING' ? '→' : '←'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      {rel.edge.relationshipType.replace(/_/g, ' ')}
                    </span>
                    <span className="block truncate font-semibold text-foreground">{rel.neighborName}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ask AI */}
      <div className="space-y-2 border-t border-border pt-3">
        <h5 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Ask AI About This</h5>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) onAskSubmit(question.trim());
          }}
          className="space-y-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Question to ask the AI about this entity"
            className={`w-full rounded-lg ${SURFACE.input} px-3 py-2 text-xs ${FOCUS_RING}`}
            placeholder={DEFAULT_QUESTION}
          />
          <Button type="submit" variant="secondary" size="sm" className="w-full" loading={askLoading} disabled={!question.trim()}>
            Ask AI
          </Button>
        </form>
        {askError && <p className="text-[11px] text-destructive">{askError}</p>}
        {askResult && (
          <div className="rounded-xl border border-info/30 bg-info/10 p-2.5 space-y-1">
            <p className="text-foreground leading-relaxed">{askResult.answer}</p>
            <p className="text-[10px] text-muted-foreground">Grounded in {askResult.evidenceUsed} piece(s) of evidence.</p>
          </div>
        )}
      </div>
    </div>
  );
}
