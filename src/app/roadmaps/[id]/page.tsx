'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  description: string;
  order: number;
  estimatedHours: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  resources?: { title: string; url: string; snippet?: string }[];
}

interface Phase {
  id: string;
  title: string;
  description: string;
  order: number;
  durationWeeks: number;
  tasks: Task[];
}

interface Roadmap {
  id: string;
  title: string;
  description: string;
  goal: string;
  targetSkill: string;
  experienceLevel: string;
  dailyTimeCommitment: string;
  targetDurationWeeks: number;
  learningStyle: string;
  currentProgress: number;
  phases: Phase[];
}

export default function RoadmapDetailPage() {
  const params = useParams();
  const roadmapId = params.id as string;

  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [permission, setPermission] = useState<'OWNER' | 'EDIT' | 'VIEW'>('VIEW');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Phase regeneration loading map
  const [regeneratingPhases, setRegeneratingPhases] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchRoadmap() {
      try {
        const res = await fetch(`/api/roadmaps/${roadmapId}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load roadmap.');
        }
        setRoadmap(data.data.roadmap);
        setPermission(data.data.permission);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error loading roadmap.');
      } finally {
        setLoading(false);
      }
    }
    fetchRoadmap();
  }, [roadmapId]);

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    if (permission === 'VIEW') return;

    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    // Optimistic UI update
    setRoadmap((prev) => {
      if (!prev) return null;
      let totalTasks = 0;
      let completedCount = 0;

      const updatedPhases = prev.phases.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((task) => {
          const isTarget = task.id === taskId;
          const status = isTarget ? newStatus : task.status;
          totalTasks++;
          if (status === 'COMPLETED') completedCount++;
          return isTarget ? { ...task, status: newStatus as any } : task;
        })
      }));

      const progress = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
      return { ...prev, currentProgress: progress, phases: updatedPhases };
    });

    try {
      await fetch(`/api/roadmaps/${roadmapId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch {}
  };

  const handleRegeneratePhase = async (phaseId: string) => {
    if (permission === 'VIEW') return;
    setRegeneratingPhases((prev) => ({ ...prev, [phaseId]: true }));

    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/phases/${phaseId}/regenerate`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success && data.data) {
        setRoadmap((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            phases: prev.phases.map((p) => (p.id === phaseId ? data.data : p))
          };
        });
      }
    } catch {
    } finally {
      setRegeneratingPhases((prev) => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShareMsg(null);
    try {
      const res = await fetch(`/api/roadmaps/${roadmapId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserEmail: shareEmail, permission: sharePermission })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Share failed.');
      }
      setShareMsg('Roadmap shared successfully!');
      setShareEmail('');
      setTimeout(() => setShowShareModal(false), 2000);
    } catch (err) {
      setShareMsg(err instanceof Error ? err.message : 'Sharing failed.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 font-mono text-xs text-indigo-400 animate-pulse">
        Loading Roadmap Architecture...
      </div>
    );
  }

  if (errorMsg || !roadmap) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8 flex flex-col items-center justify-center space-y-4 text-center">
        <div className="text-4xl">🗺️</div>
        <h2 className="text-xl font-bold text-foreground">Roadmap Not Found</h2>
        <p className="text-xs text-muted-foreground">{errorMsg || 'You may not have permission to view this roadmap.'}</p>
        <Link href="/roadmaps" className="px-4 py-2 bg-indigo-600 text-foreground rounded-xl text-xs font-medium">
          Return to My Roadmaps
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 sm:p-10">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        {/* Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <Link href="/roadmaps" className="text-xs text-muted-foreground hover:text-foreground">
                ← Roadmaps
              </Link>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                {permission} ACCESS
              </span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent mt-2">
              {roadmap.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{roadmap.description}</p>
          </div>

          <div className="flex items-center space-x-3">
            {permission === 'OWNER' && (
              <button
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-medium transition"
              >
                Share 🤝
              </button>
            )}
            <Link
              href={`/chat?q=Explain ${encodeURIComponent(roadmap.targetSkill)} core concepts and best practices&sourceMode=web_search`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-medium rounded-xl shadow-lg transition"
            >
              Ask AI Assistant ✨
            </Link>
          </div>
        </div>

        {/* Progress Overview Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-border rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">Overall Completion</div>
              <div className="text-3xl font-bold text-foreground font-mono mt-0.5">{roadmap.currentProgress}%</div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-mono text-foreground">
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                🎯 Goal: <span className="text-foreground font-semibold">{roadmap.goal}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                ⏱️ Schedule: <span className="text-foreground font-semibold">{roadmap.dailyTimeCommitment}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-background border border-border">
                📅 Duration: <span className="text-foreground font-semibold">{roadmap.targetDurationWeeks} Weeks</span>
              </div>
            </div>
          </div>

          <div className="w-full h-3 bg-background rounded-full overflow-hidden border border-border">
            <div
              className="h-full bg-gradient-to-r from-indigo-600 via-sky-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${roadmap.currentProgress}%` }}
            />
          </div>
        </div>

        {/* Phases & Tasks Breakdown */}
        <div className="space-y-6">
          {roadmap.phases.map((phase) => (
            <div
              key={phase.id}
              className="bg-surface/80 border border-border rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-start justify-between border-b border-border/80 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                      Phase {phase.order} ({phase.durationWeeks} Wks)
                    </span>
                    <h3 className="text-base font-bold text-foreground">{phase.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{phase.description}</p>
                </div>

                {permission !== 'VIEW' && (
                  <button
                    onClick={() => handleRegeneratePhase(phase.id)}
                    disabled={regeneratingPhases[phase.id]}
                    className="px-3 py-1.5 bg-surface-hover hover:bg-muted disabled:opacity-50 text-xs text-indigo-300 rounded-lg transition whitespace-nowrap"
                  >
                    {regeneratingPhases[phase.id] ? 'Refreshing...' : 'Regenerate Phase 🔄'}
                  </button>
                )}
              </div>

              {/* Tasks List */}
              <div className="space-y-3">
                {phase.tasks.map((task) => {
                  const isDone = task.status === 'COMPLETED';
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border transition space-y-2 ${
                        isDone
                          ? 'bg-background/40 border-border/50 opacity-75'
                          : 'bg-background/80 border-border hover:border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <input
                            type="checkbox"
                            checked={isDone}
                            disabled={permission === 'VIEW'}
                            onChange={() => handleToggleTask(task.id, task.status)}
                            className="mt-1 h-4 w-4 rounded border-border bg-surface text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div>
                            <span className={`text-xs font-semibold ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {task.title}
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{task.description}</p>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-muted-foreground bg-surface border border-border px-2 py-0.5 rounded whitespace-nowrap">
                          ~{task.estimatedHours}h
                        </span>
                      </div>

                      {/* Resource Recommendations */}
                      {task.resources && task.resources.length > 0 && (
                        <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="text-muted-foreground">Resources:</span>
                          {task.resources.map((res, idx) => (
                            <a
                              key={idx}
                              href={res.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center space-x-1"
                            >
                              <span>📖 {res.title}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Ask AI Contextual Action */}
                      <div className="pt-1 flex items-center justify-end">
                        <Link
                          href={`/chat?q=Explain ${encodeURIComponent(task.title)} for ${encodeURIComponent(roadmap.targetSkill)}&sourceMode=web_search`}
                          className="text-[10px] text-sky-400 hover:text-sky-300 underline font-mono"
                        >
                          Ask AI about this task →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Share Roadmap</h3>
            <p className="text-xs text-muted-foreground">
              Grant another registered user access to view or edit this roadmap.
            </p>

            {shareMsg && (
              <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800 text-xs text-indigo-300">
                {shareMsg}
              </div>
            )}

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">User Email</label>
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Permission</label>
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="VIEW">VIEW (Read-only)</option>
                  <option value="EDIT">EDIT (Modify tasks & phases)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 bg-surface-hover text-foreground text-xs rounded-xl hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-foreground font-medium text-xs rounded-xl shadow-lg"
                >
                  Grant Share Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
