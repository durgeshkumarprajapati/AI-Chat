'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent">
            Account Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your workspace user profile, security preferences, and active authentication session.
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3">
            Profile Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block mb-1">Account Role</span>
              <span className="inline-block px-2.5 py-1 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 font-mono font-medium">
                USER / AUTHENTICATED
              </span>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Security Status</span>
              <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-mono font-medium">
                ACTIVE & SECURE
              </span>
            </div>
          </div>
        </div>

        {/* Session Security */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3">
            Session Controls
          </h3>

          <p className="text-xs text-slate-400">
            Sign out of your active HttpOnly session on this device.
          </p>

          <button
            onClick={handleLogout}
            className="py-2 px-4 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-lg text-xs font-medium transition shadow-lg"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
