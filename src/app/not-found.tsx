'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans text-slate-900 dark:text-slate-100">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-3xl shadow-sm">
        🔍
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">404 - Page Not Found</h1>
      <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
        The requested document, workspace, or application route does not exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition inline-block"
      >
        Return to Dashboard ➔
      </Link>
    </div>
  );
}
