'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto w-full font-sans selection:bg-[#4d8eff] selection:text-white">
        {/* Navigation Back Link */}
        <div className="flex items-center space-x-3 border-b border-[#424754]/60 pb-4">
          <Link
            href="/knowledge-graph"
            className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#0a0e18] hover:bg-[#171b26] border border-[#424754] text-xs font-semibold text-[#c2c6d6] hover:text-[#dfe2f1] transition"
          >
            <span>←</span>
            <span>Back to Knowledge Graph</span>
          </Link>
        </div>

        {loading ? (
          <div className="bg-[#0a0e18]/80 border border-[#424754] rounded-2xl p-16 flex flex-col items-center justify-center space-y-4 min-h-[320px]">
            <div className="w-12 h-12 rounded-full border-2 border-[#4d8eff]/20 border-t-[#4d8eff] animate-spin" />
            <p className="text-xs font-bold text-[#dfe2f1]">Loading Entity Intelligence...</p>
          </div>
        ) : data?.entity ? (
          <div className="space-y-6">
            <div className="bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
              {/* Subtle ambient glow */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-[#4d8eff]/10 blur-[100px] pointer-events-none rounded-full" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#424754]/60 pb-6 relative z-10">
                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/30 uppercase tracking-wider">
                    {data.entity.entityType}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#dfe2f1] tracking-tight">
                    {data.entity.canonicalName}
                  </h1>
                </div>

                <div className="px-3.5 py-1.5 rounded-xl bg-[#0f131d] border border-[#424754] inline-flex items-center space-x-2 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
                  <span className="text-xs font-mono font-bold text-[#4edea3]">
                    {(data.entity.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
              </div>

              {data.entity.description && (
                <div className="p-4 rounded-xl bg-[#0f131d] border border-[#424754] space-y-1 relative z-10">
                  <span className="text-[10px] font-mono text-[#c2c6d6] uppercase font-bold tracking-wider">
                    Description & Context
                  </span>
                  <p className="text-xs text-[#c2c6d6] leading-relaxed">{data.entity.description}</p>
                </div>
              )}

              <div className="pt-2 flex flex-wrap gap-3 relative z-10">
                <Link
                  href={`/copilot?q=${encodeURIComponent(`Explain concept ${data.entity.canonicalName}`)}`}
                  className="px-4 py-2.5 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-95 text-[#0a0e18] rounded-xl text-xs font-extrabold transition shadow-lg shadow-[#4d8eff]/20 flex items-center space-x-2"
                >
                  <span>🤖</span>
                  <span>Ask Copilot About Concept</span>
                </Link>

                <Link
                  href={`/research?topic=${encodeURIComponent(data.entity.canonicalName)}`}
                  className="px-4 py-2.5 bg-[#0f131d] hover:bg-[#171b26] border border-[#424754] text-[#dfe2f1] hover:border-[#8c909f] rounded-xl text-xs font-bold transition flex items-center space-x-2"
                >
                  <span>🔬</span>
                  <span>Launch Agentic Research</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#0a0e18]/80 border border-[#424754] rounded-2xl p-10 text-center space-y-2">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-bold text-[#dfe2f1]">Entity Not Found</p>
            <p className="text-xs text-[#c2c6d6]">The specified entity record does not exist in the knowledge graph index.</p>
          </div>
        )}
      </div>
  );
}
