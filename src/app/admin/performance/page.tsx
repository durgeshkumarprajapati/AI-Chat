'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface PerformanceData {
  database: { available: boolean; healthy: boolean; pingMs: number | null };
  redis: { available: boolean; healthy: boolean; pingMs: number | null };
  rag: {
    available: boolean;
    sampleWindowHours: number;
    sampleCount: number;
    avgTotalLatencyMs: number | null;
    avgRetrievalLatencyMs: number | null;
    avgLlmLatencyMs: number | null;
    avgTimeToFirstTokenMs: number | null;
  };
  cache: { answerCacheTtlSeconds: number; singleFlightEnabled: boolean };
  worker: { available: boolean; reason: string };
  config: { slowQueryThresholdMs: number; multimodalImageProcessingConcurrency: number };
  // Phase 88 — additive, optional cross-cutting telemetry aggregation.
  apiLatency?:
    | {
        available: true;
        p50: number;
        p95: number;
        p99: number;
        count: number;
        targetLatencyMs: number;
        meetsTarget: boolean;
        routeBreakdown: { route: string; p50: number; p95: number; count: number }[];
      }
    | { available: false; reason: string };
  slowestOperations?:
    | {
        available: true;
        slowRequestThresholdMs: number;
        data: { operation: string; category: string; avgMs: number; count: number; isSlow: boolean }[];
      }
    | { available: false; reason: string };
  cacheHitRatios?:
    | { available: true; data: { source: string; hitRatio: number; hits: number; misses: number }[] }
    | { available: false; reason: string };
  workflowMetrics?:
    | { available: true; sampleWindowHours: number; totalExecutions: number; byStatus: Record<string, number> }
    | { available: false; reason: string };
}

function HealthBadge({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
        healthy
          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
      }`}
    >
      ● {healthy ? 'HEALTHY' : 'UNREACHABLE'}
    </span>
  );
}

export default function AdminPerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/performance').then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Access denied');
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin access required.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center font-sans text-slate-900 dark:text-slate-100">
        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-mono animate-pulse">Loading performance dashboard…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center font-sans text-slate-900 dark:text-slate-100">
        <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-6 rounded-2xl max-w-md text-center shadow-sm">
          <h2 className="text-lg font-bold mb-2">Access Denied</h2>
          <p className="text-xs mb-4">{error}</p>
          <Link href="/dashboard" className="inline-block py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs rounded-lg font-semibold transition">
            Back to Workspace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 sm:p-10 font-sans text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-[1400px] mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-emerald-800 to-emerald-600 dark:from-white dark:to-emerald-300 bg-clip-text text-transparent">
                Performance & Reliability
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-mono font-bold">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Live infrastructure health and real RAG latency aggregates — observability only, never influences request handling.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 shadow-sm text-xs font-semibold disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {/* Infrastructure Health */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Database (Postgres)</span>
              <HealthBadge healthy={data.database.healthy} />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.database.pingMs !== null ? `${data.database.pingMs} ms` : '—'}
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Live round-trip: SELECT 1, measured this request</p>
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Redis</span>
              <HealthBadge healthy={data.redis.healthy} />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.redis.pingMs !== null ? `${data.redis.pingMs} ms` : '—'}
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Live round-trip: SET+GET probe key, measured this request</p>
          </div>
        </div>

        {/* RAG Latency */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
            RAG Latency — last {data.rag.sampleWindowHours}h ({data.rag.sampleCount} evaluated answers)
          </h3>
          {!data.rag.available ? (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              No RagEvaluation rows in the last {data.rag.sampleWindowHours}h — nothing to aggregate yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avg Total Latency</div>
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                  {data.rag.avgTotalLatencyMs !== null ? `${data.rag.avgTotalLatencyMs} ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avg Retrieval</div>
                <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">
                  {data.rag.avgRetrievalLatencyMs !== null ? `${data.rag.avgRetrievalLatencyMs} ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avg LLM Latency</div>
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  {data.rag.avgLlmLatencyMs !== null ? `${data.rag.avgLlmLatencyMs} ms` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avg Time to First Token</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {data.rag.avgTimeToFirstTokenMs !== null ? `${data.rag.avgTimeToFirstTokenMs} ms` : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cache & Config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cache Configuration</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Answer cache TTL</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{data.cache.answerCacheTtlSeconds}s</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Single-flight dedup</span>
              <span className={`font-mono font-bold ${data.cache.singleFlightEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                {data.cache.singleFlightEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Performance Configuration</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Slow-operation threshold</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{data.config.slowQueryThresholdMs}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Multimodal image concurrency</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{data.config.multimodalImageProcessingConcurrency}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono pt-1">Editable via Manage Configs → Performance category</p>
          </div>
        </div>

        {/* Worker */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
            Worker Throughput
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-500">{data.worker.reason}</p>
        </div>

        {/* API Latency (Phase 88) */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              API Latency — this process{data.apiLatency?.available ? ` (${data.apiLatency.count} requests)` : ''}
            </h3>
            {data.apiLatency?.available && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  data.apiLatency.meetsTarget
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                }`}
              >
                {data.apiLatency.meetsTarget ? '● WITHIN TARGET' : '● ABOVE TARGET'} ({data.apiLatency.targetLatencyMs}ms)
              </span>
            )}
          </div>
          {!data.apiLatency || !data.apiLatency.available ? (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Unavailable — {data.apiLatency ? data.apiLatency.reason : 'apiLatency not returned by this build.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">p50</div>
                  <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{data.apiLatency.p50} ms</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">p95</div>
                  <div className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">{data.apiLatency.p95} ms</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">p99</div>
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{data.apiLatency.p99} ms</div>
                </div>
              </div>
              {data.apiLatency.routeBreakdown.length > 0 && (
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 dark:text-slate-400">
                        <th className="pb-2 font-semibold">Route</th>
                        <th className="pb-2 font-semibold text-right">p50</th>
                        <th className="pb-2 font-semibold text-right">p95</th>
                        <th className="pb-2 font-semibold text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {data.apiLatency.routeBreakdown.map((r) => (
                        <tr key={r.route} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 text-slate-700 dark:text-slate-300">{r.route}</td>
                          <td className="py-1.5 text-right text-slate-900 dark:text-white">{r.p50} ms</td>
                          <td className="py-1.5 text-right text-slate-900 dark:text-white">{r.p95} ms</td>
                          <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Slowest Operations & Cache Hit Ratios (Phase 88) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
              Slowest Operations
            </h3>
            {!data.slowestOperations || !data.slowestOperations.available ? (
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Unavailable — {data.slowestOperations ? data.slowestOperations.reason : 'slowestOperations not returned by this build.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th className="pb-2 font-semibold">Operation</th>
                      <th className="pb-2 font-semibold">Category</th>
                      <th className="pb-2 font-semibold text-right">Avg</th>
                      <th className="pb-2 font-semibold text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {data.slowestOperations.data.map((op) => (
                      <tr key={op.operation} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 text-slate-700 dark:text-slate-300">{op.operation}</td>
                        <td className="py-1.5 text-slate-500 dark:text-slate-400">{op.category}</td>
                        <td className={`py-1.5 text-right font-bold ${op.isSlow ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                          {op.avgMs} ms
                        </td>
                        <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{op.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
              Cache Hit Ratios
            </h3>
            {!data.cacheHitRatios || !data.cacheHitRatios.available ? (
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Unavailable — {data.cacheHitRatios ? data.cacheHitRatios.reason : 'cacheHitRatios not returned by this build.'}
              </p>
            ) : (
              <div className="space-y-3">
                {data.cacheHitRatios.data.map((c) => (
                  <div key={c.source} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{c.source}</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {c.hitRatio}% <span className="text-slate-400 dark:text-slate-500 font-normal">({c.hits}/{c.hits + c.misses})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Automation Workflow Executions (Phase 88) */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
            Automation Workflow Executions {data.workflowMetrics?.available ? `— last ${data.workflowMetrics.sampleWindowHours}h` : ''}
          </h3>
          {!data.workflowMetrics || !data.workflowMetrics.available ? (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Unavailable — {data.workflowMetrics ? data.workflowMetrics.reason : 'workflowMetrics not returned by this build.'}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{data.workflowMetrics.totalExecutions} executions</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.workflowMetrics.byStatus).map(([status, count]) => (
                  <span
                    key={status}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono font-bold"
                  >
                    {status}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
