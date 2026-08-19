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
      <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" aria-hidden="true" />
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center space-x-2">
        <Link
          href="/login"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition shadow-sm"
        >
          🔑 Log In
        </Link>
        <Link
          href="/register"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/20"
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
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="User account menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center space-x-2 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-indigo-500 transition shadow-sm"
      >
        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-[10px]">
          {initials}
        </div>
        <span className="font-semibold max-w-[100px] truncate">{currentUser.name}</span>
        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold border border-indigo-200 dark:border-indigo-800 uppercase">
          {currentUser.role}
        </span>
        <span className="text-[10px] opacity-60">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1">
          {/* User Info Header */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
          </div>

          {/* Account Settings Link */}
          <Link
            href="/account"
            onClick={() => setIsOpen(false)}
            className="flex items-center space-x-2 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <span>👤</span>
            <span>Account Settings</span>
          </Link>

          {/* Logout Action */}
          <button
            type="button"
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition text-left border-t border-slate-100 dark:border-slate-800/80 mt-1"
          >
            <span>🚪</span>
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
