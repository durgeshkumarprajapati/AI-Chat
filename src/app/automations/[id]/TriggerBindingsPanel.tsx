'use client';

// Phase 88 Part A — manages an automation's AutomationTriggerBinding rows: which
// AutomationTriggerType values wake this automation up. See automationsApi.ts's
// `setTriggerBindingEnabled` doc comment for a noted gap: the contract has no PATCH route for an
// existing binding, so "disable" deletes it and "re-enable" re-creates it (new id).
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SURFACE, FOCUS_RING } from '@/lib/design-system/theme.constants';
import { TRIGGER_TYPE_LABEL, TRIGGER_TYPES, type AutomationTriggerBindingDTO, type AutomationTriggerType } from '../automation.types';

interface Props {
  bindings: AutomationTriggerBindingDTO[];
  onAdd: (_triggerType: AutomationTriggerType) => Promise<void>;
  onToggle: (_binding: AutomationTriggerBindingDTO, _enabled: boolean) => Promise<void>;
  onDelete: (_binding: AutomationTriggerBindingDTO) => Promise<void>;
}

export default function TriggerBindingsPanel({ bindings, onAdd, onToggle, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const boundTypes = new Set(bindings.map((b) => b.triggerType));
  const availableTypes = TRIGGER_TYPES.filter((t) => !boundTypes.has(t));

  async function handleAdd(triggerType: AutomationTriggerType) {
    setAdding(true);
    setPickerOpen(false);
    try {
      await onAdd(triggerType);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(binding: AutomationTriggerBindingDTO) {
    setBusyId(binding.id);
    try {
      await onToggle(binding, !binding.enabled);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(binding: AutomationTriggerBindingDTO) {
    setBusyId(binding.id);
    try {
      await onDelete(binding);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Triggers</h3>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            loading={adding}
            disabled={availableTypes.length === 0}
            onClick={() => setPickerOpen((v) => !v)}
          >
            + Add Trigger
          </Button>
          {pickerOpen && availableTypes.length > 0 && (
            <div className={`absolute right-0 mt-1 z-10 w-64 rounded-xl ${SURFACE.modalPanel} p-1.5 space-y-0.5`}>
              {availableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => void handleAdd(t)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-foreground hover:bg-accent ${FOCUS_RING}`}
                >
                  {TRIGGER_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {bindings.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No triggers configured — this automation will only run when triggered manually via the API.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bindings.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{TRIGGER_TYPE_LABEL[b.triggerType]}</p>
                <Badge variant={b.enabled ? 'success' : 'neutral'} className="mt-1">
                  {b.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  loading={busyId === b.id}
                  onClick={() => void handleToggle(b)}
                >
                  {b.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-destructive"
                  loading={busyId === b.id}
                  onClick={() => void handleDelete(b)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
