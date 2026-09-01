'use client';

// Phase 88 Part A — read-only list of past AutomationVersions. Clicking one loads it read-only
// into the canvas (workflow definitions are immutable once published — editing always starts a
// new draft based on the CURRENT version, never rewrites history).
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { AutomationVersionRef } from '../automation.types';

interface Props {
  versions: AutomationVersionRef[];
  currentVersionNumber: number | null;
  viewingVersionNumber: number | null; // null = viewing the live draft
  onSelectVersion: (_versionNumber: number) => void;
  onReturnToDraft: () => void;
}

export default function VersionHistoryPanel({ versions, currentVersionNumber, viewingVersionNumber, onSelectVersion, onReturnToDraft }: Props) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Version History</h3>
        {viewingVersionNumber !== null && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onReturnToDraft}>
            Back to Draft
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No published versions yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((v) => {
            const isCurrent = v.versionNumber === currentVersionNumber;
            const isViewing = v.versionNumber === viewingVersionNumber;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onSelectVersion(v.versionNumber)}
                  className={`w-full text-left rounded-xl border p-2.5 transition-colors duration-150 ${
                    isViewing ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-foreground">v{v.versionNumber}</span>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(v.createdAt).toLocaleString()}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
