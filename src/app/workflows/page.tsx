'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function WorkflowsDashboardPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wfRes, tmplRes] = await Promise.all([
        fetch('/api/workflows').then((r) => r.json()),
        fetch('/api/workflow-templates').then((r) => r.json())
      ]);

      if (wfRes.success) setWorkflows(wfRes.data || []);
      if (tmplRes.success) setTemplates(tmplRes.data || []);
    } catch (err: any) {
      setError('Failed to load workflow data.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (tmpl: any) => {
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tmpl.name,
          description: tmpl.description,
          definition: tmpl.definition
        })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `/workflows/${data.data.id}/edit`;
      }
    } catch {
      alert('Failed to copy template.');
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>🧩</span> Workflows & Automation Engine
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Build, automate, and orchestrate Document AI, RAG, Web Search, and Agentic Research pipelines.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/workflows/new"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition flex items-center gap-2"
          >
            <span>+</span> New Workflow
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* User Workflows Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>📁</span> My Workflows
        </h2>

        {loading ? (
          <div className="py-12 text-center text-gray-500">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-xl space-y-3">
            <p className="text-gray-500 dark:text-gray-400">No workflows created yet.</p>
            <Link
              href="/workflows/new"
              className="inline-block px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Create your first workflow →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{wf.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                      {wf.description || 'No description provided.'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      wf.status === 'PUBLISHED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                    }`}
                  >
                    {wf.status}
                  </span>
                </div>

                <div className="flex items-center text-xs text-gray-400 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span>Runs: {wf._count?.runs || 0}</span>
                  <span>Version: v{wf.versions?.[0]?.version || 1}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View Details
                  </Link>
                  <Link
                    href={`/workflows/${wf.id}/edit`}
                    className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded"
                  >
                    Edit Canvas
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Built-in Templates Section */}
      <section className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>⚡</span> Workflow Templates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="p-5 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-gray-900 dark:to-gray-850 border border-indigo-100 dark:border-gray-800 rounded-xl space-y-3"
            >
              <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded">
                {tmpl.category}
              </span>
              <h3 className="font-semibold text-gray-900 dark:text-white">{tmpl.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{tmpl.description}</p>
              <button
                onClick={() => handleUseTemplate(tmpl)}
                className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
