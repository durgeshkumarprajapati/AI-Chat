'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';

export default function EntityDetailPage() {
  const params = useParams();
  const entityId = params?.entityId as string;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (entityId) {
      fetchEntity();
    }
  }, [entityId]);

  async function fetchEntity() {
    try {
      setLoading(true);
      const res = await fetch(`/api/knowledge-graph?depth=2`);
      const json = await res.json();
      if (json.success && json.data) {
        const entity = (json.data.nodes || []).find((n: any) => n.id === entityId) || json.data.nodes[0];
        setData({ entity, nodes: json.data.nodes, edges: json.data.edges });
      }
    } catch (err) {
      console.error('Failed to fetch entity detail:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <a href="/knowledge-graph" className="text-slate-400 hover:text-white text-sm">
            ← Back to Graph
          </a>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : data?.entity ? (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 uppercase">
                    {data.entity.entityType}
                  </span>
                  <h1 className="text-3xl font-bold text-white tracking-tight mt-2">{data.entity.canonicalName}</h1>
                </div>
                <span className="text-sm font-mono text-emerald-400 font-bold">
                  {(data.entity.confidence * 100).toFixed(0)}% Confidence
                </span>
              </div>

              {data.entity.description && <p className="text-slate-300 text-sm">{data.entity.description}</p>}

              <div className="pt-4 border-t border-slate-800 flex flex-wrap gap-3">
                <a
                  href={`/copilot?q=${encodeURIComponent(`Explain concept ${data.entity.canonicalName}`)}`}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition shadow"
                >
                  🤖 Ask Copilot
                </a>
                <a
                  href={`/research?topic=${encodeURIComponent(data.entity.canonicalName)}`}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition border border-slate-700"
                >
                  🔬 Research Concept
                </a>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-400">Entity not found.</p>
        )}
      </div>
    </AppLayout>
  );
}
