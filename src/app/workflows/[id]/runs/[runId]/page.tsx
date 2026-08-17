'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function WorkflowRunDetailPage({ params }: { params: { id: string; runId: string } }) {
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchRunDetails();
    const interval = setInterval(fetchRunDetails, 2000);
    return () => clearInterval(interval);
  }, [params.runId]);

  const fetchRunDetails = async () => {
    try {
      const res = await fetch(`/api/workflows/${params.id}/runs/${params.runId}`).then((r) => r.json());
      if (res.success) setRun(res.data);
    } catch {
      console.error('Failed to load run detail');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await fetch(`/api/workflows/${params.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: params.runId })
      });
      fetchRunDetails();
    } catch {
      alert('Failed to cancel run');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading execution details...</div>;
  if (!run) return <div className="p-8 text-center text-red-500">Run execution not found.</div>;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Run: <span className="font-mono text-indigo-600">{run.id}</span>
            </h1>
            <span
              className={`px-3 py-0.5 text-xs font-semibold rounded-full ${
                run.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-800'
                  : run.status === 'RUNNING'
                  ? 'bg-blue-100 text-blue-800 animate-pulse'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {run.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Trigger: {run.triggerType} | Steps Executed: {run.stepCount || 0}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {run.status === 'RUNNING' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded shadow disabled:opacity-50"
            >
              {cancelling ? 'Stopping...' : 'Stop Workflow'}
            </button>
          )}
          <Link href={`/workflows/${params.id}`} className="text-xs text-indigo-600 hover:underline">
            ← Back to Workflow
          </Link>
        </div>
      </div>

      {run.error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs font-mono">
          {run.error}
        </div>
      )}

      {/* Step Execution Timeline */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Node Execution Timeline</h2>

        <div className="space-y-4">
          {(run.runNodes || []).map((rn: any, idx: number) => (
            <div key={rn.id} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 space-y-2 text-xs">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-indigo-600 dark:text-indigo-400 font-mono">
                  #{idx + 1} {rn.nodeKey}
                </span>
                <span
                  className={`px-2 py-0.5 rounded ${
                    rn.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {rn.status}
                </span>
              </div>

              {rn.output && (
                <div className="p-2 bg-white dark:bg-gray-900 border rounded font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(rn.output, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
