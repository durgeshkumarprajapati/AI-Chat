'use client';

import { useState, useEffect } from 'react';

interface MemoryItem {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: string;
}

export default function CopilotMemorySettingsPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  useEffect(() => {
    fetchMemories();
  }, []);

  async function fetchMemories() {
    try {
      const res = await fetch('/api/copilot/memory');
      const data = await res.json();
      if (data.success) {
        setMemories(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch memories', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMemory(id: string) {
    try {
      const res = await fetch(`/api/copilot/memory/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete memory', err);
    }
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to clear all Copilot memories?')) return;
    try {
      const res = await fetch('/api/copilot/memory', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMemories([]);
      }
    } catch (err) {
      console.error('Failed to clear memories', err);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">💾</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Copilot Controlled Memory</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Transparent user-approved memory. You control what the Copilot remembers across project sessions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              memoryEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300'
            }`}
          >
            {memoryEnabled ? 'Memory Enabled ✅' : 'Memory Disabled ⛔'}
          </button>

          {memories.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition"
            >
              Clear All Memory
            </button>
          )}
        </div>
      </div>

      {/* Memory Items Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading memory items...</div>
      ) : memories.length === 0 ? (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-4xl">🧠</span>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No Remembered Items</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            When you run Copilot sessions or save preferences, your explicit project context and goals will be listed here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {memories.map((m) => (
            <div
              key={m.id}
              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {m.category}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{m.key}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 font-sans">{m.value}</p>
                <p className="text-[10px] text-slate-400 font-mono">Source: {m.source}</p>
              </div>

              <button
                onClick={() => handleDeleteMemory(m.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-semibold text-xs transition self-end sm:self-center"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
