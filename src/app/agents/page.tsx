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

const DISABLED_MESSAGE_MARKER = 'INTELLIGENCE_AGENT_ENABLED';

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
  const [goal, setGoal] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [disabledBanner, setDisabledBanner] = useState(false);

  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runLoadError, setRunLoadError] = useState<string | null>(null);

  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [stepActionLoading, setStepActionLoading] = useState<Record<number, 'approve' | 'reject' | null>>({});

  const [cancelling, setCancelling] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
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

  // Poll while the run is in a non-terminal state.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun?.id, currentRun?.status]);

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
        if (message.includes(DISABLED_MESSAGE_MARKER) || message.toLowerCase().includes('disabled by configuration')) {
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
        // The reject route returns only the updated step, not the full run — refetch for the
        // authoritative run state (rejecting a required step cascades to REJECT the whole run).
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

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🤖</span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Agent Workspace</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            State a goal, review the AI&apos;s proposed plan and required permissions, approve or reject each step, and watch execution progress.
          </p>
        </div>

        <Button variant="secondary" size="md" onClick={toggleHistory}>
          {historyOpen ? 'Hide history' : '🕓 History'}
        </Button>
      </div>

      {disabledBanner && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 text-warning text-xs font-semibold px-4 py-3">
          The AI Agent platform is currently disabled by an administrator.
        </div>
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
          <CardTitle>Start a New Run</CardTitle>
        </CardHeader>
        <form onSubmit={handleStart} className="space-y-3">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe what you want the agent to do..."
            rows={3}
            className="w-full bg-input border border-input-border rounded-xl p-3 text-sm text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
              {starting ? 'Planning...' : 'Start'}
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
                <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-1">Run Status</p>
                <Badge variant={RUN_STATUS_BADGE[currentRun.status]} className="text-sm px-3 py-1">
                  {currentRun.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              {!isTerminalRun && (
                <Button variant="destructive" size="sm" loading={cancelling} onClick={handleCancel}>
                  Cancel Run
                </Button>
              )}
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

          {/* Steps */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">Plan Steps</h2>
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
                  return (
                    <Card key={step.id} className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-xs font-mono text-muted-foreground">
                            Step {step.stepIndex + 1} · <span className="text-foreground">{step.toolId}</span>
                          </p>
                          <p className="text-sm text-foreground">{step.description}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Badge variant={RISK_BADGE[step.riskLevel]}>{step.riskLevel.replace(/_/g, ' ')}</Badge>
                          <Badge variant={STEP_STATUS_BADGE[step.status]}>{step.status}</Badge>
                        </div>
                      </div>

                      {showApproval && (
                        <div className="space-y-2 border-t border-border pt-3">
                          <input
                            type="text"
                            value={stepNotes[step.stepIndex] ?? ''}
                            onChange={(e) => setStepNotes((prev) => ({ ...prev, [step.stepIndex]: e.target.value }))}
                            placeholder="Optional approval/rejection note..."
                            className="w-full bg-input border border-input-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-text-disabled focus:outline-none focus:border-primary"
                          />
                          <div className="flex gap-2">
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

                      {isTerminalStep && (
                        <div className="border-t border-border pt-3 space-y-2">
                          {step.errorMessage && <p className="text-xs text-destructive">{step.errorMessage}</p>}
                          {step.outputJson !== null && step.outputJson !== undefined && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground mb-1">Output</p>
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
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No active run</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Describe a goal above to have the AI agent plan and propose a set of steps, or pick a past run from History.
          </p>
        </div>
      )}
    </div>
  );
}
