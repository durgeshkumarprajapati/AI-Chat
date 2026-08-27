'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProjectDetail } from '@/features/projects/types/project.types';
import { ProjectAuditPanel } from '@/components/projects/ProjectAuditPanel';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'audit'>('overview');

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        const data = await res.json();
        if (data.success) {
          setProject(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch project detail', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [params.id]);

  if (loading) {
    return <div className="max-w-6xl mx-auto p-12 text-center text-xs text-slate-400 font-mono">Loading workspace details...</div>;
  }

  if (!project) {
    return <div className="max-w-6xl mx-auto p-12 text-center text-xs text-rose-400">Project workspace not found.</div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Top Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">📁</span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{project.name}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{project.description || 'Unified AI Workspace'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href={`/copilot?projectId=${project.id}`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-1.5"
            >
              <span>🧠 Launch Copilot for Project</span>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.documentCount}</span>
            <span className="text-[10px] text-slate-500">Documents</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.roadmapCount}</span>
            <span className="text-[10px] text-slate-500">Roadmaps</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.studySessionCount}</span>
            <span className="text-[10px] text-slate-500">Study Sessions</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.researchSessionCount}</span>
            <span className="text-[10px] text-slate-500">Research</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.workflowCount}</span>
            <span className="text-[10px] text-slate-500">Workflows</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.conversationCount}</span>
            <span className="text-[10px] text-slate-500">Chats</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">{project.memberCount}</span>
            <span className="text-[10px] text-slate-500">Members</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 transition-colors ${
            activeTab === 'overview'
              ? 'border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          📁 Workspace Overview
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 transition-colors ${
            activeTab === 'audit'
              ? 'border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          🛡 Enterprise Audit Log
        </button>
      </div>

      {activeTab === 'audit' ? (
        <ProjectAuditPanel projectId={project.id} />
      ) : (
        /* Linked Resources Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Documents */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>📁 Linked Documents</span>
              </h3>
              <Link href="/documents" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + Manage
              </Link>
            </div>
            {project.documents.length === 0 ? (
              <p className="text-xs text-slate-400">No documents linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.documents.map((d) => (
                  <div key={d.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{d.filename}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{d.mimeType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roadmaps */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🚀 Roadmaps</span>
              </h3>
              <Link href="/roadmaps" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.roadmaps.length === 0 ? (
              <p className="text-xs text-slate-400">No roadmaps linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.roadmaps.map((r) => (
                  <Link key={r.id} href={`/roadmaps/${r.roadmapId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Study Sessions */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🎓 Study & Tutor Sessions</span>
              </h3>
              <Link href="/study" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.studySessions.length === 0 ? (
              <p className="text-xs text-slate-400">No study sessions linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.studySessions.map((s) => (
                  <Link key={s.id} href={`/study/${s.studySessionId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{s.title}</span>
                    <span className="text-[10px] text-indigo-500 font-mono ml-2">({s.difficulty})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Agentic Research Reports */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>🤖 Agentic Research</span>
              </h3>
              <Link href="/research" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                + View
              </Link>
            </div>
            {project.researchSessions.length === 0 ? (
              <p className="text-xs text-slate-400">No research investigations linked yet.</p>
            ) : (
              <div className="space-y-2">
                {project.researchSessions.map((res) => (
                  <Link key={res.id} href={`/research/${res.researchSessionId}`} className="block p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs hover:border-indigo-500/50 transition">
                    <span className="font-semibold text-slate-900 dark:text-white">{res.title}</span>
                    <span className="text-[10px] text-emerald-500 font-mono ml-2">({res.status})</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
