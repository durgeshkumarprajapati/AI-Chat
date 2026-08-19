'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  goal: string;
  targetSkill: string;
  currentProgress: number;
  targetDurationWeeks: number;
  status: string;
  createdAt: string;
}

interface SharedItem {
  shareId: string;
  permission: 'VIEW' | 'EDIT';
  sharedBy: { id: string; name: string; email: string };
  roadmap: RoadmapItem;
}

export default function RoadmapsDashboardPage() {
  const router = useRouter();
  const [owned, setOwned] = useState<RoadmapItem[]>([]);
  const [shared, setShared] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');

  useEffect(() => {
    async function loadRoadmaps() {
      try {
        const res = await fetch('/api/roadmaps');
        const data = await res.json();
        if (data.success && data.data) {
          setOwned(data.data.owned || []);
          setShared(data.data.shared || []);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    loadRoadmaps();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this roadmap?')) return;
    try {
      const res = await fetch(`/api/roadmaps/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setOwned((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {}
  };

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/roadmaps/${id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data) {
        setOwned((prev) => [data.data, ...prev]);
        router.push(`/roadmaps/${data.data.id}`);
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🚀</span>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                AI Roadmap Builder & Personal Workspace
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Generate personalized learning paths, track progress, master new skills, and share roadmaps with peers.
            </p>
          </div>

          <Link
            href="/roadmaps/new"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-2 whitespace-nowrap self-start sm:self-auto"
          >
            <span>+ Create New Roadmap</span>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-2">
          <button
            onClick={() => setActiveTab('owned')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'owned'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            My Roadmaps ({owned.length})
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'shared'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Shared With Me ({shared.length})
          </button>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="py-20 text-center text-xs text-indigo-400 font-mono animate-pulse">
            Loading Roadmaps...
          </div>
        ) : activeTab === 'owned' ? (
          owned.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
              <div className="text-4xl">🗺️</div>
              <h3 className="text-base font-bold text-white">No Roadmaps Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Build your first AI-guided learning roadmap with custom phase breakdowns and task tracking.
              </p>
              <Link
                href="/roadmaps/new"
                className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg transition"
              >
                Create Roadmap Now
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {owned.map((item) => (
                <div
                  key={item.id}
                  onClick={() => router.push(`/roadmaps/${item.id}`)}
                  className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 shadow-xl space-y-4 transition cursor-pointer group flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                        {item.targetSkill}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {item.targetDurationWeeks} Weeks
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-white group-hover:text-indigo-300 transition">
                      {item.title}
                    </h2>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.description}</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Progress</span>
                        <span className="text-indigo-300 font-bold">{Math.round(item.currentProgress)}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-600 to-sky-400 transition-all duration-500"
                          style={{ width: `${item.currentProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                      <span className="text-slate-400 text-[11px]">
                        Goal: {item.goal}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => handleDuplicate(item.id, e)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg transition"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-[11px] rounded-lg transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : shared.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
            <div className="text-4xl">🤝</div>
            <h3 className="text-base font-bold text-white">No Shared Roadmaps</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              When peers or mentors share learning roadmaps with you, they will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shared.map((item) => (
              <div
                key={item.shareId}
                onClick={() => router.push(`/roadmaps/${item.roadmap.id}`)}
                className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 shadow-xl space-y-4 transition cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                      Shared by {item.sharedBy.name || item.sharedBy.email}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px] font-bold">
                      {item.permission} PERMISSION
                    </span>
                  </div>

                  <h2 className="text-base font-bold text-white group-hover:text-indigo-300 transition">
                    {item.roadmap.title}
                  </h2>
                  <p className="text-xs text-slate-400 line-clamp-2">{item.roadmap.description}</p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Progress</span>
                      <span className="text-emerald-400 font-bold">{Math.round(item.roadmap.currentProgress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${item.roadmap.currentProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
