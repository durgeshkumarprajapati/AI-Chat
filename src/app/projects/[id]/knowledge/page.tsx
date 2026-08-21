'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ProjectKnowledgeGraphPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchProjectGraph();
    }
  }, [projectId]);

  async function fetchProjectGraph() {
    try {
      setLoading(true);
      const res = await fetch(`/api/knowledge-graph?projectId=${projectId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch (err) {
      console.error('Failed to fetch project graph:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Project Knowledge Graph</h1>
          <p className="text-xs text-slate-400">Scoped entity network for Project ID: {projectId}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-300 text-sm">
            Showing {nodes.length} project entities and {edges.length} relationships.
          </p>
        </div>
      )}
    </div>
  );
}
