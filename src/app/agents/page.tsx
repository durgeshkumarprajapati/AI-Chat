'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

type AgentRunStatus = 'PLANNING' | 'AWAITING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED';
type AgentRiskLevel = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AgentStepStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

interface AgentPlanStep {
  id: string;
  agentRunId: string;
  stepIndex: number;
  toolId: string;
  description: string;
  inputJson: unknown;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  status: AgentStepStatus;
  approvalDecision: string;
  approverId: string | null;
  approvalDecidedAt: string | null;
  approvalNote: string | null;
  outputJson: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface AgentRun {
  id: string;
  userId: string;
  projectId: string | null;
  goal: string;
  status: AgentRunStatus;
  planJson: unknown;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AgentPlanStep[];
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema: unknown;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
}

const IN_PROGRESS_STATUSES: AgentRunStatus[] = ['PLANNING', 'AWAITING_APPROVAL', 'EXECUTING'];
const TERMINAL_STEP_STATUSES: AgentStepStatus[] = ['SUCCEEDED', 'FAILED'];

const RUN_STATUS_BADGE: Record<AgentRunStatus, BadgeVariant> = {
  PLANNING: 'neutral',
  AWAITING_APPROVAL: 'warning',
  EXECUTING: 'info',
  COMPLETED: 'success',
  FAILED: 'destructive',
  REJECTED: 'destructive',
  CANCELLED: 'neutral'
};

const RISK_BADGE: Record<AgentRiskLevel, BadgeVariant> = {
  READ_ONLY: 'neutral',
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'destructive',
  CRITICAL: 'destructive'
};

const STEP_STATUS_BADGE: Record<AgentStepStatus, BadgeVariant> = {
  PENDING: 'neutral',
  APPROVED: 'info',
  REJECTED: 'destructive',
  EXECUTING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  SKIPPED: 'neutral'
};

const PRESET_GOALS = [
  'Review yesterday\'s meeting and propose ClickUp tasks for agreed action items',
  'Search document knowledge base for security policy and check project status',
  'Find upcoming calendar events for this week and check for meeting follow-ups',
  'Inspect knowledge graph entities for architecture dependencies'
];

function apiErrorMessage(json: any, fallback: string): string {
  if (!json?.error) return fallback;
  return typeof json.error === 'string' ? json.error : json.error?.message || fallback;
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AgentWorkspacePage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [goal, setGoal] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [disabledBanner, setDisabledBanner] = useState(false);

  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runLoadError, setRunLoadError] = useState<string | null>(null);

  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [stepActionLoading, setStepActionLoading] = useState<Record<number, 'approve' | 'reject' | 'edit' | null>>({});
  const [approvingAll, setApprovingAll] = useState(false);

  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editInputText, setEditInputText] = useState('');
  const [editDescriptionText, setEditDescriptionText] = useState('');

  const [cancelling, setCancelling] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setProjects(json.data.map((p: any) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});

    fetch('/api/agents/tools')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setTools(json.data);
      })
      .catch(() => {});
  }, []);

  const fetchRun = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/agents/runs/${runId}`);
      const json = await res.json();
      if (json.success) {
        setCurrentRun(json.data);
        setRunLoadError(null);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to load agent run.'));
      }
    } catch {
      setRunLoadError('Failed to load agent run.');
    }
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (currentRun && IN_PROGRESS_STATUSES.includes(currentRun.status)) {
      pollRef.current = setInterval(() => {
        fetchRun(currentRun.id);
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [currentRun?.id, currentRun?.status, fetchRun]);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/agents/runs');
      const json = await res.json();
      if (json.success) {
        setHistory(json.data);
      } else {
        setHistoryError(apiErrorMessage(json, 'Failed to load run history.'));
      }
    } catch {
      setHistoryError('Failed to load run history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadHistory();
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setStarting(true);
    setStartError(null);
    setDisabledBanner(false);
    try {
      const res = await fetch('/api/agents/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), projectId: selectedProjectId || undefined })
      });
      const json = await res.json();
      if (json.success) {
        setCurrentRun(json.data);
        setGoal('');
        if (historyOpen) loadHistory();
      } else {
        const message = apiErrorMessage(json, 'Failed to start agent run.');
        if (message.includes('AI_AGENT_ENABLED') || message.includes('INTELLIGENCE_AGENT_ENABLED') || message.toLowerCase().includes('disabled by configuration')) {
          setDisabledBanner(true);
        } else {
          setStartError(message);
        }
      }
    } catch {
      setStartError('Failed to start agent run.');
    } finally {
      setStarting(false);
    }
  }

  async function handleApprove(stepIndex: number) {
    if (!currentRun) return;
    setStepActionLoading((prev) => ({ ...prev, [stepIndex]: 'approve' }));
    try {
      const res = await fetch(`/api/agents/runs/${currentRun.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex, note: stepNotes[stepIndex]?.trim() || undefined })
      });
      const json = await res.json();
      if (json.success) {
        setCurrentRun(json.data);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to approve step.'));
      }
    } catch {
      setRunLoadError('Failed to approve step.');
    } finally {
      setStepActionLoading((prev) => ({ ...prev, [stepIndex]: null }));
    }
  }

  async function handleApproveAll() {
    if (!currentRun) return;
    setApprovingAll(true);
    try {
      const res = await fetch(`/api/agents/runs/${currentRun.id}/approve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (json.success) {
        setCurrentRun(json.data);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to approve all steps.'));
      }
    } catch {
      setRunLoadError('Failed to approve all steps.');
    } finally {
      setApprovingAll(false);
    }
  }

  async function handleReject(stepIndex: number) {
    if (!currentRun) return;
    setStepActionLoading((prev) => ({ ...prev, [stepIndex]: 'reject' }));
    try {
      const res = await fetch(`/api/agents/runs/${currentRun.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex, note: stepNotes[stepIndex]?.trim() || undefined })
      });
      const json = await res.json();
      if (json.success) {
        await fetchRun(currentRun.id);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to reject step.'));
      }
    } catch {
      setRunLoadError('Failed to reject step.');
    } finally {
      setStepActionLoading((prev) => ({ ...prev, [stepIndex]: null }));
    }
  }

  function startEditStep(step: AgentPlanStep) {
    setEditingStepIndex(step.stepIndex);
    setEditInputText(prettyJson(step.inputJson));
    setEditDescriptionText(step.description);
  }

  async function handleSaveStepEdit(stepIndex: number) {
    if (!currentRun) return;
    setStepActionLoading((prev) => ({ ...prev, [stepIndex]: 'edit' }));
    try {
      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = JSON.parse(editInputText);
      } catch {
        setRunLoadError('Invalid JSON input format.');
        setStepActionLoading((prev) => ({ ...prev, [stepIndex]: null }));
        return;
      }

      const res = await fetch(`/api/agents/runs/${currentRun.id}/edit-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepIndex,
          input: parsedInput,
          description: editDescriptionText.trim() || undefined
        })
      });
      const json = await res.json();
      if (json.success) {
        setEditingStepIndex(null);
        await fetchRun(currentRun.id);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to save step edit.'));
      }
    } catch {
      setRunLoadError('Failed to save step edit.');
    } finally {
      setStepActionLoading((prev) => ({ ...prev, [stepIndex]: null }));
    }
  }

  async function handleCancel() {
    if (!currentRun) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/agents/runs/${currentRun.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setCurrentRun(json.data);
      } else {
        setRunLoadError(apiErrorMessage(json, 'Failed to cancel run.'));
      }
    } catch {
      setRunLoadError('Failed to cancel run.');
    } finally {
      setCancelling(false);
    }
  }

  function selectHistoryRun(run: AgentRun) {
    setRunLoading(true);
    fetchRun(run.id).finally(() => setRunLoading(false));
  }

  const isTerminalRun = currentRun ? !IN_PROGRESS_STATUSES.includes(currentRun.status) : false;
  const pendingApprovalSteps = currentRun?.steps.filter((s) => s.status === 'PENDING' && s.requiresApproval) || [];

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🤖</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">AI Agent Platform</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Controlled AI Agent platform. Orchestrates tools with strict human-in-the-loop approvals, non-secret configs, and audit logging.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="md" onClick={() => setToolsOpen(!toolsOpen)}>
            {toolsOpen ? 'Hide Tools' : '🛠️ Registered Tools'}
          </Button>
          <Button variant="secondary" size="md" onClick={toggleHistory}>
            {historyOpen ? 'Hide History' : '🕓 History'}
          </Button>
        </div>
      </div>

      {disabledBanner && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold px-4 py-3">
          The AI Agent platform is currently disabled by configuration (AI_AGENT_ENABLED). Contact an administrator to enable it in Admin Control Center.
        </div>
      )}

      {/* Tools Catalog Drawer */}
      {toolsOpen && (
        <Card className="space-y-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">Registered Tools ({tools.length})</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map((t) => (
              <div key={t.id} className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{t.id}</span>
                  <Badge variant={RISK_BADGE[t.riskLevel]}>{t.riskLevel}</Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{t.description}</p>
                <div className="text-[10px] font-mono text-slate-400">
                  {t.requiresApproval ? '⚠️ Requires Human Approval' : '⚡ Auto-Executable'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History panel */}
      {historyOpen && (
        <Card className="space-y-3">
          <CardHeader>
            <CardTitle>Run History</CardTitle>
          </CardHeader>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">Loading history...</p>
          ) : historyError ? (
            <p className="text-xs text-destructive">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No past runs yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => selectHistoryRun(run)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-accent rounded-lg px-2 transition-colors"
                >
                  <span className="text-xs text-foreground truncate flex-1">{run.goal}</span>
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                  <Badge variant={RUN_STATUS_BADGE[run.status]}>{run.status.replace(/_/g, ' ')}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Goal input */}
      <Card className="space-y-4">
        <CardHeader>
          <CardTitle>Start a New Agent Session</CardTitle>
        </CardHeader>
        <form onSubmit={handleStart} className="space-y-3">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe what you want the AI agent to do..."
            rows={3}
            className="w-full bg-input border border-input-border rounded-xl p-3 text-sm text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary resize-none"
          />

          {/* Presets */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Quick Presets:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_GOALS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setGoal(preset)}
                  className="text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg transition-colors text-left"
                >
                  💡 {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between pt-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">No project (user-scoped)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="md" loading={starting} disabled={!goal.trim()}>
              {starting ? 'Planning...' : 'Generate Plan'}
            </Button>
          </div>
          {startError && <p className="text-xs text-destructive">{startError}</p>}
        </form>
      </Card>

      {/* Current run */}
      {runLoading && !currentRun ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading run...</div>
      ) : currentRun ? (
        <div className="space-y-4">
          {runLoadError && <p className="text-xs text-destructive">{runLoadError}</p>}

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-1">Session Status</p>
                <Badge variant={RUN_STATUS_BADGE[currentRun.status]} className="text-sm px-3 py-1">
                  {currentRun.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {pendingApprovalSteps.length > 0 && (
                  <Button variant="success" size="sm" loading={approvingAll} onClick={handleApproveAll}>
                    Approve All ({pendingApprovalSteps.length})
                  </Button>
                )}
                {!isTerminalRun && (
                  <Button variant="destructive" size="sm" loading={cancelling} onClick={handleCancel}>
                    Cancel Run
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground">
              <span className="font-semibold">Goal: </span>
              {currentRun.goal}
            </p>
            {currentRun.resultSummary && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Result Summary</p>
                <p className="text-xs text-foreground leading-relaxed">{currentRun.resultSummary}</p>
              </div>
            )}
          </Card>

          {/* Plan Steps Review & Human-in-the-Loop Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">Plan Steps & Human Approval Policy</h2>
              <span className="text-xs text-slate-500 font-mono">{currentRun.steps.length} Step(s)</span>
            </div>

            {currentRun.steps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No steps proposed yet.</p>
            ) : (
              currentRun.steps
                .slice()
                .sort((a, b) => a.stepIndex - b.stepIndex)
                .map((step) => {
                  const showApproval = step.status === 'PENDING' && step.requiresApproval;
                  const isTerminalStep = TERMINAL_STEP_STATUSES.includes(step.status);
                  const loadingAction = stepActionLoading[step.stepIndex];
                  const isEditing = editingStepIndex === step.stepIndex;

                  return (
                    <Card key={step.id} className="space-y-3 border-l-4" style={{ borderLeftColor: step.requiresApproval ? '#f59e0b' : '#3b82f6' }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-muted-foreground">
                            Step {step.stepIndex + 1} · <span className="text-foreground font-bold">{step.toolId}</span>
                          </p>
                          <p className="text-sm font-medium text-foreground">{step.description}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Badge variant={RISK_BADGE[step.riskLevel]}>{step.riskLevel.replace(/_/g, ' ')}</Badge>
                          <Badge variant={STEP_STATUS_BADGE[step.status]}>{step.status}</Badge>
                        </div>
                      </div>

                      {/* Display input parameters */}
                      {!isEditing && (
                        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2.5 border border-slate-200 dark:border-slate-800 text-xs">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Input Parameters</p>
                          <pre className="font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                            {prettyJson(step.inputJson)}
                          </pre>
                        </div>
                      )}

                      {/* Editing step form */}
                      {isEditing && (
                        <div className="space-y-2 border-t border-border pt-3">
                          <p className="text-xs font-bold text-amber-500">Edit Proposed Action Inputs:</p>
                          <input
                            type="text"
                            value={editDescriptionText}
                            onChange={(e) => setEditDescriptionText(e.target.value)}
                            placeholder="Description"
                            className="w-full bg-input border border-input-border rounded-xl px-3 py-1.5 text-xs text-foreground"
                          />
                          <textarea
                            value={editInputText}
                            onChange={(e) => setEditInputText(e.target.value)}
                            rows={4}
                            className="w-full font-mono bg-input border border-input-border rounded-xl p-3 text-xs text-foreground"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              loading={loadingAction === 'edit'}
                              onClick={() => handleSaveStepEdit(step.stepIndex)}
                            >
                              Save Changes
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingStepIndex(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Approval controls */}
                      {showApproval && !isEditing && (
                        <div className="space-y-2 border-t border-border pt-3">
                          <input
                            type="text"
                            value={stepNotes[step.stepIndex] ?? ''}
                            onChange={(e) => setStepNotes((prev) => ({ ...prev, [step.stepIndex]: e.target.value }))}
                            placeholder="Optional approval/rejection note..."
                            className="w-full bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="success"
                              size="sm"
                              loading={loadingAction === 'approve'}
                              disabled={!!loadingAction}
                              onClick={() => handleApprove(step.stepIndex)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => startEditStep(step)}
                            >
                              ✏️ Edit Plan
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              loading={loadingAction === 'reject'}
                              disabled={!!loadingAction}
                              onClick={() => handleReject(step.stepIndex)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Output details for terminal steps */}
                      {isTerminalStep && (
                        <div className="border-t border-border pt-3 space-y-2">
                          {step.errorMessage && <p className="text-xs text-destructive font-medium">{step.errorMessage}</p>}
                          {step.outputJson !== null && step.outputJson !== undefined && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground mb-1">Execution Output</p>
                              <pre className="text-[11px] font-mono bg-muted border border-border rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto text-foreground">
                                {prettyJson(step.outputJson)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })
            )}
          </div>
        </div>
      ) : (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">🤖</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No active agent session</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Describe a goal above to have the AI agent plan and propose a set of steps, or select a preset prompt to get started.
          </p>
        </div>
      )}
    </div>
  );
}
