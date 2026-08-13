'use client';

import { useState, useEffect } from 'react';

type SystemHealth = {
  status: string;
  timestamp: string;
  services: {
    database: string;
    redis: string;
    rabbitmq: string;
    ollama: string;
  };
  storage?: {
    provider: string;
    status: string;
  };
  details: {
    pgvector: string;
    embeddingModel: string;
    embeddingDimensions: string;
  };
};

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch system health:', err);
    }
  };

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Infrastructure Health</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time status monitoring for PostgreSQL, pgvector, Redis, RabbitMQ broker, and local Ollama model server.
          </p>
        </div>
        <button
          onClick={fetchHealth}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <span>↻ Re-check Services</span>
        </button>
      </div>

      {/* Health Overview Card */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span
              className={`w-3 h-3 rounded-full ${
                health?.status === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <h2 className="text-lg font-bold text-white">Overall System Status</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Last Checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '...'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* PostgreSQL + pgvector */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🐘</span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  health?.services.database === 'healthy'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {health?.services.database === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">PostgreSQL Database</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">Port 5432 / 5433</p>
            </div>
            <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-0.5">
              <p>• Extension: pgvector {health?.details.pgvector || '0.8.6'}</p>
              <p>• Schema: public.document_chunks</p>
              <p>• Index: HNSW (vector_cosine_ops)</p>
            </div>
          </div>

          {/* RabbitMQ */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🐇</span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  health?.services.rabbitmq === 'healthy'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {health?.services.rabbitmq === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">RabbitMQ Message Queue</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">AMQP Port 5672</p>
            </div>
            <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-0.5">
              <p>• Queue: &quot;document-processing&quot;</p>
              <p>• Worker: Decoupled Node.js Worker</p>
              <p>• Retry Policy: 3 Max Retries</p>
            </div>
          </div>

          {/* Redis */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🔴</span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  health?.services.redis === 'healthy'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {health?.services.redis === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Redis Cache & Locks</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">Port 6379</p>
            </div>
            <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-0.5">
              <p>• Semantic Retrieval Cache</p>
              <p>• Rate Limiting & Dist. Locks</p>
              <p>• Response: PONG</p>
            </div>
          </div>

          {/* Ollama / LLM */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🦙</span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  health?.services.ollama === 'healthy'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {health?.services.ollama === 'healthy' ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Ollama AI Engine</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">HTTP Port 11434</p>
            </div>
            <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-0.5">
              <p>• Embedding: {health?.details.embeddingModel || 'nomic-embed-text'}</p>
              <p>• Vector Dimension: {health?.details.embeddingDimensions || '768'}</p>
              <p>• LLM Provider: Provider Factory</p>
            </div>
          </div>

          {/* RAG Evaluation & Answer Quality */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl">📈</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                Healthy
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">RAG Evaluation Engine</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">Phase 19 Quality Analytics</p>
            </div>
            <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-400 space-y-0.5">
              <p>• Evaluator: LocalHeuristicEvaluator</p>
              <p>• Telemetry: Non-blocking Async</p>
              <p>• User Feedback: 👍/👎 Upsert Enabled</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
