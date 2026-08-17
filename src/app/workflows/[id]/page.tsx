'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const [workflow, setWorkflow] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [_error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wfRes, runsRes] = await Promise.all([
        fetch(`/api/workflows/${params.id}`).then((r) => r.json()),
        fetch(`/api/workflows/${params.id}/runs`).then((r) => r.json())
      ]);

      if (wfRes.success) setWorkflow(wfRes.data);
      if (runsRes.success) setRuns(runsRes.data || []);
    } catch {
      setError('Failed to load workflow details.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    try {
      setExecuting(true);
      const res = await fetch(`/api/workflows/${params.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `/workflows/${params.id}/runs/${data.data.runId}`;
      } else {
        alert(data.error || 'Execution failed.');
      }
    } catch {
      alert('Execution failed.');
    } finally {
      setExecuting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading workflow...</div>;
  if (!workflow) return <div className="p-8 text-center text-red-500">Workflow not found.</div>;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{workflow.name}</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
              {workflow.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{workflow.description || 'No description'}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/workflows/${workflow.id}/edit`}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-lg"
          >
            ✏️ Edit Canvas
          </Link>
          <button
            onClick={handleExecute}
            disabled={executing}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow transition disabled:opacity-50"
          >
            {executing ? 'Executing...' : '▶ Execute Workflow'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-900 p-6 border rounded-xl space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Version</h2>
            <div className="text-xs text-gray-500 space-y-1">
              <p>Active Version: v{workflow.versions?.[0]?.version || 1}</p>
              <p>Checksum: {workflow.versions?.[0]?.checksum?.slice(0, 16) || 'N/A'}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-xs overflow-x-auto max-h-60">
              {JSON.stringify(workflow.versions?.[0]?.definition || {}, null, 2)}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 border rounded-xl space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Executions</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-gray-500">No runs executed yet.</p>
            ) : (
              <div className="divide-y border rounded-lg">
                {runs.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    href={`/workflows/${workflow.id}/runs/${r.id}`}
                    className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 text-xs block"
                  >
                    <div>
                      <span className="font-semibold">{r.id.slice(0, 8)}...</span>
                      <span className="ml-3 text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        r.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 p-6 border rounded-xl space-y-3 text-xs">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Triggers</h3>
            {(workflow.triggers || []).map((t: any) => (
              <div key={t.id} className="p-2 border rounded">
                <span className="font-medium text-indigo-600">{t.type}</span>
                <span className="ml-2 text-gray-400">{t.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
