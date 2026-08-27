'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';

export function UserProfileMenu() {
  const { currentUser, authStatus, logout } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (authStatus === 'LOADING') {
    return (
      <div className="h-8 w-24 bg-slate-100 dark:bg-[#0a0e18] border border-slate-300 dark:border-[#424754] rounded-xl animate-pulse" aria-hidden="true" />
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center space-x-2 font-sans">
        <Link
          href="/login"
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-800 dark:text-[#dfe2f1] bg-white dark:bg-[#0f131d] hover:bg-slate-100 dark:hover:bg-[#141926] border border-slate-300 dark:border-[#424754] transition shadow-sm"
        >
          🔑 Log In
        </Link>
        <Link
          href="/register"
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white dark:text-[#0a0e18] bg-indigo-600 dark:bg-gradient-to-r dark:from-[#4d8eff] dark:to-[#adc6ff] hover:opacity-90 transition shadow-md shadow-indigo-600/20 dark:shadow-[#4d8eff]/20"
        >
          Sign Up ✨
        </Link>
      </div>
    );
  }

  const initials = currentUser.name
    ? currentUser.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <div className="relative inline-block text-left font-sans select-none" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User account menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center space-x-2 rounded-xl border border-slate-300 dark:border-[#424754] bg-white dark:bg-[#0a0e18] px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-[#dfe2f1] hover:border-indigo-500 dark:hover:border-[#4d8eff] transition shadow-sm"
      >
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 dark:from-[#4d8eff] dark:to-[#adc6ff] text-white dark:text-[#0a0e18] font-extrabold flex items-center justify-center text-[10px]">
          {initials}
        </div>
        <span className="font-bold max-w-[100px] truncate">{currentUser.name}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-[#4d8eff]/15 text-indigo-700 dark:text-[#adc6ff] font-mono font-bold border border-indigo-200 dark:border-[#4d8eff]/30 uppercase">
          {currentUser.role}
        </span>
        <span className="text-[10px] opacity-60 text-slate-400 dark:text-[#8c909f]">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-[#0a0e18] border border-slate-200 dark:border-[#424754] shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1 font-sans">
          {/* User Info Header */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-[#424754]/60 space-y-0.5">
            <p className="text-xs font-bold text-slate-900 dark:text-[#dfe2f1] truncate">{currentUser.name}</p>
            <p className="text-[11px] text-slate-500 dark:text-[#8c909f] font-mono truncate">{currentUser.email}</p>
          </div>

          {/* Account Settings Link */}
          <Link
            href="/account"
            onClick={() => setIsOpen(false)}
            className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-[#c2c6d6] hover:text-slate-900 dark:hover:text-[#dfe2f1] hover:bg-slate-100 dark:hover:bg-[#1c1f2a] transition"
          >
            <span>👤</span>
            <span>Account Settings</span>
          </Link>

          {/* Admin Manage Configs Link */}
          {currentUser.role === 'ADMIN' && (
            <Link
              href="/admin/configuration"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-indigo-600 dark:text-[#adc6ff] hover:bg-indigo-50 dark:hover:bg-[#1c2438] transition"
            >
              <span>⚙️</span>
              <span>Manage Configs</span>
            </Link>
          )}

          {/* Logout Action */}
          <button
            type="button"
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            className="w-full text-left flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          >
            <span>🚪</span>
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
