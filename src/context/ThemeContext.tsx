'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWorkspace } from './WorkspaceContext';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (_mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useWorkspace();
  const userId = currentUser?.id;

  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [mounted, setMounted] = useState(false);

  const getStorageKey = useCallback(() => {
    return userId ? `docai_user_${userId}_theme` : 'docai_guest_theme';
  }, [userId]);

  const applyThemeToDOM = useCallback((resolved: ResolvedTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.setAttribute('data-theme', resolved);
    setResolvedTheme(resolved);
  }, []);

  const getSystemTheme = useCallback((): ResolvedTheme => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  // Rehydrate theme preference on mount or when userId changes
  useEffect(() => {
    setMounted(true);
    const storageKey = getStorageKey();
    let savedTheme = (localStorage.getItem(storageKey) as ThemeMode) || null;

    if (!savedTheme && !userId) {
      savedTheme = (localStorage.getItem('docai_theme') as ThemeMode) || 'dark';
    }

    const initialTheme: ThemeMode = savedTheme || 'dark';
    setThemeState(initialTheme);

    const resolved = initialTheme === 'system' ? getSystemTheme() : initialTheme;
    applyThemeToDOM(resolved);
  }, [userId, getStorageKey, applyThemeToDOM, getSystemTheme]);

  // Handle system preference changes when in 'system' mode
  useEffect(() => {
    if (typeof window === 'undefined' || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const resolved = mediaQuery.matches ? 'dark' : 'light';
        applyThemeToDOM(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyThemeToDOM]);

  const setTheme = useCallback(
    (newMode: ThemeMode) => {
      setThemeState(newMode);
      const storageKey = getStorageKey();
      try {
        localStorage.setItem(storageKey, newMode);
        localStorage.setItem('docai_theme', newMode); // Global backup
      } catch {}

      const resolved = newMode === 'system' ? getSystemTheme() : newMode;
      applyThemeToDOM(resolved);
    },
    [getStorageKey, getSystemTheme, applyThemeToDOM]
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: mounted ? resolvedTheme : 'dark', setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
