'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function UserDashboardPage() {
  const [stats, setStats] = useState<{ docCount: number; convCount: number; kbCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [docsRes, convsRes, kbsRes] = await Promise.all([
          fetch('/api/documents').then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/conversations').then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/knowledge-bases').then((r) => r.json()).catch(() => ({ data: [] }))
        ]);

        setStats({
          docCount: docsRes.data?.length || 0,
          convCount: convsRes.data?.length || 0,
          kbCount: kbsRes.data?.length || 0
        });
      } catch {
        setStats({ docCount: 0, convCount: 0, kbCount: 0 });
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent">
            User Workspace Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Overview of your active documents, intelligent chats, and custom knowledge collections.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400 text-xl font-bold">
              📄
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.docCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Uploaded Documents</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-sky-950/80 border border-sky-800/80 flex items-center justify-center text-sky-400 text-xl font-bold">
              💬
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.convCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Active Conversations</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-purple-950/80 border border-purple-800/80 flex items-center justify-center text-purple-400 text-xl font-bold">
              📚
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.kbCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Knowledge Collections</div>
            </div>
          </div>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/chat"
            className="group bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-900/40 hover:border-indigo-500/60 rounded-2xl p-6 transition shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="text-2xl mb-2">✨</div>
              <h3 className="text-base font-semibold text-white group-hover:text-indigo-300 transition">
                Start Intelligent RAG Chat
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Ask questions against your documents, web sources, or attach images/PDFs inline with grounded citations.
              </p>
            </div>
            <div className="mt-6 text-xs text-indigo-400 font-medium flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
              <span>Open Chat Workspace</span>
              <span>→</span>
            </div>
          </Link>

          <Link
            href="/documents"
            className="group bg-gradient-to-br from-sky-950/40 to-slate-900 border border-sky-900/40 hover:border-sky-500/60 rounded-2xl p-6 transition shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="text-2xl mb-2">📂</div>
              <h3 className="text-base font-semibold text-white group-hover:text-sky-300 transition">
                Manage Documents & Uploads
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Upload PDFs, extract tables, OCR scanned pages, build knowledge collections, and manage access policies.
              </p>
            </div>
            <div className="mt-6 text-xs text-sky-400 font-medium flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
              <span>Manage Documents</span>
              <span>→</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
