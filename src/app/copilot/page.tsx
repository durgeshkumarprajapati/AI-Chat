'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { speechToTextService, VoiceState } from '@/features/voice';
import { CopilotExecutionResult } from '@/features/copilot/types/copilot.types';
import { ProjectSummary } from '@/features/projects/types/project.types';

function CopilotContent() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);

  const [query, setQuery] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<CopilotExecutionResult | null>(null);

  // Voice Input (Phase 32)
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');

  // Confirmation modal state
  const [approvingActionId, setApprovingActionId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();

    const unsubVoiceState = speechToTextService.onStateChange((st) => setVoiceState(st));
    const unsubTranscript = speechToTextService.onTranscript((text, isFinal) => {
      if (isFinal) {
        setQuery((prev) => (prev ? `${prev} ${text}`.trim() : text));
      }
    });

    return () => {
      unsubVoiceState();
      unsubTranscript();
    };
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  }

  const handleToggleVoice = () => {
    if (voiceState === 'LISTENING' || voiceState === 'STARTING') {
      speechToTextService.stopListening();
    } else {
      speechToTextService.startListening();
    }
  };

  async function handleRunCopilot(customQuery?: string) {
    const q = customQuery || query;
    if (!q.trim()) return;

    setExecuting(true);
    setResult(null);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          projectId: selectedProjectId || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      }
    } catch (err) {
      console.error('Copilot execution error', err);
    } finally {
      setExecuting(false);
    }
  }

  async function handleApproveAction(actionId: string) {
    setApprovingActionId(actionId);
    try {
      const res = await fetch(`/api/copilot/actions/${actionId}/approve`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && result) {
        // Refresh session
        handleRunCopilot();
      }
    } catch (err) {
      console.error('Action approval error', err);
    } finally {
      setApprovingActionId(null);
    }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header & Project Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Knowledge & Research Copilot</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Orchestrate RAG, Web Search, Agentic Research, Roadmaps, Study Mode, and Workflows seamlessly.
              </p>
            </div>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="">Global (All Resources)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Copilot Input Box */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          What would you like to accomplish today?
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Research the latest Next.js 15 features, compare with my uploaded PDF, and create a 30-day learning roadmap."
          rows={3}
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
        />

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Voice Input Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center space-x-1.5 transition ${
              voiceState === 'LISTENING'
                ? 'bg-rose-100 dark:bg-rose-950 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 animate-pulse'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{voiceState === 'LISTENING' ? '🔴' : '🎤'}</span>
            <span>{voiceState === 'LISTENING' ? 'Listening...' : 'Voice Input'}</span>
          </button>

          <button
            onClick={() => handleRunCopilot()}
            disabled={executing || !query.trim()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            <span>{executing ? 'Orchestrating...' : 'Ask Copilot ✨'}</span>
          </button>
        </div>

        {/* Suggested Prompt Pills */}
        <div className="pt-2 flex flex-wrap gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 text-[11px] self-center">Suggested:</span>
          {[
            'Analyze my uploaded PDF and explain key concepts',
            'Research latest official documentation online',
            'Create a 30-day learning roadmap',
            'Start an interactive study tutor session',
            'Build an automated document summary workflow'
          ].map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(prompt);
                handleRunCopilot(prompt);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 hover:bg-indigo-50 dark:hover:bg-indigo-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition text-[11px] font-medium"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Results View */}
      {result && (
        <div className="space-y-6">
          {/* Plan & Timeline View */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>📋 Copilot Execution Plan</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {result.intent}
                </span>
              </h2>
              <span className={`text-xs font-mono font-bold ${result.status === 'COMPLETED' ? 'text-emerald-500' : 'text-amber-500'}`}>
                Status: {result.status}
              </span>
            </div>

            {/* Plan Steps */}
            <div className="space-y-2.5">
              {result.plan.steps.map((step, idx) => {
                const actionState = result.actions.find((a) => a.capability === step.capability);
                const isCompleted = actionState?.status === 'COMPLETED';
                const isProposed = actionState?.status === 'PROPOSED';
                const isFailed = actionState?.status === 'FAILED';

                return (
                  <div
                    key={step.id}
                    className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition ${
                      isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : isProposed
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                        : isFailed
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold">{idx + 1}.</span>
                      <div>
                        <span className="font-bold uppercase tracking-wider text-[10px] block opacity-80">{step.capability}</span>
                        <span>{step.purpose}</span>
                      </div>
                    </div>

                    {isProposed && actionState && (
                      <button
                        onClick={() => handleApproveAction(actionState.id)}
                        disabled={approvingActionId === actionState.id}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow transition disabled:opacity-50"
                      >
                        {approvingActionId === actionState.id ? 'Approving...' : 'Confirm & Execute ✨'}
                      </button>
                    )}

                    {isCompleted && <span className="font-bold">✅ Done</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Response & Evidence */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Copilot Synthesis</h2>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
              {result.response}
            </div>

            {/* Citations List */}
            {result.citations.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Citations & Evidence Sources:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {result.citations.map((c, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">{c.label}</span>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 underline truncate max-w-[150px]">
                          {c.url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CopilotPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400 font-mono">Loading Copilot...</div>}>
      <CopilotContent />
    </Suspense>
  );
}
