'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled App Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans text-slate-900 dark:text-slate-100">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-3xl shadow-sm">
        ⚠️
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Something went wrong</h1>
      <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow transition"
        >
          Try Again
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl transition"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
