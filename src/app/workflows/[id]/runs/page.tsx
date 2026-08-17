'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function WorkflowRunsListPage({ params }: { params: { id: string } }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRuns();
  }, [params.id]);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/workflows/${params.id}/runs`).then((r) => r.json());
      if (res.success) setRuns(res.data || []);
    } catch {
      console.error('Failed to load runs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workflow Execution History</h1>
          <p className="text-sm text-gray-500">View past runs, execution durations, and step outputs.</p>
        </div>
        <Link href={`/workflows/${params.id}`} className="text-xs text-indigo-600 hover:underline">
          ← Back to Workflow
        </Link>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500">Loading run history...</div>
      ) : runs.length === 0 ? (
        <div className="py-8 text-center text-gray-500 border rounded-xl">No executions recorded yet.</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border rounded-xl divide-y">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/workflows/${params.id}/runs/${r.id}`}
              className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition block text-sm"
            >
              <div>
                <span className="font-mono font-bold text-indigo-600">{r.id}</span>
                <div className="text-xs text-gray-400 mt-1">
                  Trigger: {r.triggerType} | Started: {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
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
  );
}
