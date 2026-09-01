'use client';

// Phase 88 Part A — side panel for editing the currently-selected node's `config` (per
// NODE_CONFIG_SCHEMA) or the currently-selected edge's `condition`. Client-side validation here
// is UX-only, per the phase spec — the authoritative check is server-side on publish.
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SURFACE, FOCUS_RING } from '@/lib/design-system/theme.constants';
import {
  NODE_CONFIG_SCHEMA,
  NODE_TYPE_BADGE_VARIANT,
  NODE_TYPE_ICON,
  NODE_TYPE_LABEL,
  validateNodeConfig,
  type AutomationEdgeDTO,
  type AutomationNodeDTO,
  type ConditionOp
} from '../automation.types';

interface Props {
  node: AutomationNodeDTO | null;
  edge: AutomationEdgeDTO | null;
  readOnly: boolean;
  onNodeConfigChange: (_nodeKey: string, _config: Record<string, unknown>) => void;
  onDeleteNode: (_nodeKey: string) => void;
  onEdgeConditionChange: (_edgeId: string, _condition: AutomationEdgeDTO['condition']) => void;
  onDeleteEdge: (_edgeId: string) => void;
}

const CONDITION_OPS: ConditionOp[] = ['eq', 'neq', 'gt', 'lt'];

export default function AutomationInspectorPanel({
  node,
  edge,
  readOnly,
  onNodeConfigChange,
  onDeleteNode,
  onEdgeConditionChange,
  onDeleteEdge
}: Props) {
  if (!node && !edge) {
    return (
      <div className="text-xs text-muted-foreground py-6 text-center">
        Select a node or connection on the canvas to edit its configuration.
      </div>
    );
  }

  if (edge) {
    const cond = edge.condition || null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-foreground">Connection</h4>
          {!readOnly && (
            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-[11px]" onClick={() => onDeleteEdge(edge.id)}>
              Delete
            </Button>
          )}
        </div>
        <p className="text-[11px] font-mono text-muted-foreground break-all">
          {edge.source} → {edge.target}
        </p>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edge-has-condition"
            checked={cond !== null}
            disabled={readOnly}
            onChange={(e) => {
              if (e.target.checked) {
                onEdgeConditionChange(edge.id, { path: '', op: 'eq', value: '' });
              } else {
                onEdgeConditionChange(edge.id, null);
              }
            }}
            className="accent-primary"
          />
          <label htmlFor="edge-has-condition" className="text-[11px] font-semibold text-muted-foreground">
            Only follow this path when a condition is met
          </label>
        </div>

        {cond && (
          <div className="space-y-2.5 rounded-xl border border-border p-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground block mb-1">Field path</label>
              <input
                type="text"
                value={cond.path}
                disabled={readOnly}
                onChange={(e) => onEdgeConditionChange(edge.id, { ...cond, path: e.target.value })}
                placeholder="e.g. risk.severity"
                className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground block mb-1">Operator</label>
              <select
                value={cond.op}
                disabled={readOnly}
                onChange={(e) => onEdgeConditionChange(edge.id, { ...cond, op: e.target.value as ConditionOp })}
                className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              >
                {CONDITION_OPS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground block mb-1">Comparison value</label>
              <input
                type="text"
                value={String(cond.value ?? '')}
                disabled={readOnly}
                onChange={(e) => onEdgeConditionChange(edge.id, { ...cond, value: e.target.value })}
                placeholder="e.g. CRITICAL"
                className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // node is non-null here
  const n = node as AutomationNodeDTO;
  const schema = NODE_CONFIG_SCHEMA[n.type];
  const errors = validateNodeConfig(n.type, n.config || {});

  function setField(key: string, value: unknown) {
    onNodeConfigChange(n.key, { ...(n.config || {}), [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={NODE_TYPE_BADGE_VARIANT[n.type]}>
            {NODE_TYPE_ICON[n.type]} {NODE_TYPE_LABEL[n.type]}
          </Badge>
        </div>
        {!readOnly && n.type !== 'TRIGGER' && (
          <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-[11px]" onClick={() => onDeleteNode(n.key)}>
            Delete
          </Button>
        )}
      </div>
      <p className="text-[11px] font-mono text-muted-foreground break-all">{n.key}</p>

      {errors.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 space-y-1">
          {errors.map((err, idx) => (
            <p key={idx} className="text-[11px] text-destructive">⚠ {err}</p>
          ))}
        </div>
      )}

      {schema.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">This node type has no configurable fields.</p>
      ) : (
        <div className="space-y-3">
          {schema.map((field) => {
            const value = (n.config || {})[field.key];
            return (
              <div key={field.key}>
                <label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground block mb-1">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={typeof value === 'string' ? value : ''}
                    disabled={readOnly}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
                  >
                    <option value="">Select…</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={typeof value === 'string' ? value : ''}
                    disabled={readOnly}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs resize-y ${FOCUS_RING}`}
                  />
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    value={typeof value === 'number' ? value : ''}
                    disabled={readOnly}
                    onChange={(e) => setField(field.key, e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder={field.placeholder}
                    className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
                  />
                ) : (
                  <input
                    type="text"
                    value={typeof value === 'string' ? value : ''}
                    disabled={readOnly}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className={`w-full rounded-lg ${SURFACE.input} px-2.5 py-1.5 text-xs ${FOCUS_RING}`}
                  />
                )}
                {field.helpText && <p className="text-[10px] text-muted-foreground mt-1">{field.helpText}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
