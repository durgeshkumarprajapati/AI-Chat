'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewWorkflowPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'VISUAL' | 'AI'>('AI');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateVisual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Workflow name is required.');

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/workflows/${data.data.id}/edit`);
      } else {
        setError(data.error || 'Failed to create workflow.');
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return setError('AI prompt is required.');

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, name: name || undefined })
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/workflows/${data.data.id}/edit`);
      } else {
        setError(data.error || 'Failed to generate AI workflow.');
      }
    } catch {
      setError('An error occurred during AI generation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create New Workflow</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Choose to design your automation visually or describe it in natural language for AI generation.
        </p>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setTab('AI')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition ${
            tab === 'AI'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✨ Create with AI
        </button>
        <button
          type="button"
          onClick={() => setTab('VISUAL')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition ${
            tab === 'VISUAL'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📐 Create Visually
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {tab === 'AI' ? (
        <form onSubmit={handleGenerateAI} className="space-y-4 bg-white dark:bg-gray-900 p-6 border rounded-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Workflow Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Invoice Approval Pipeline"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              What should this workflow do?
            </label>
            <textarea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Whenever I upload an invoice, extract vendor, amount and date, identify invoices above ₹50,000, and create a summary."
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
              required
            />
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded-lg">
            <strong>Note:</strong> AI will generate a structured node graph. You must review and validate it before publishing or executing.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? 'Generating Structured Workflow...' : 'Generate Workflow with AI'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateVisual} className="space-y-4 bg-white dark:bg-gray-900 p-6 border rounded-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Workflow Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PDF Executive Summarizer"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this workflow..."
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Open Visual Canvas Editor'}
          </button>
        </form>
      )}
    </div>
  );
}
