import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';

/**
 * Phase 77A — the theme provider itself was NOT rewritten (already production-grade per the
 * spec's own instruction to improve/centralize rather than replace). These tests establish a
 * regression baseline for its existing apply/persist/switch behavior, which the new centralized
 * token system builds on top of.
 */
function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>go-light</button>
      <button onClick={() => setTheme('dark')}>go-dark</button>
      <button onClick={() => setTheme('system')}>go-system</button>
    </div>
  );
}

function renderWithProviders() {
  return render(
    <WorkspaceProvider>
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    </WorkspaceProvider>
  );
}

describe('Phase 77A — ThemeContext apply/persist/switch behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = window.matchMedia || ((): any => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  });

  it('applies both a class and data-theme attribute on the document root', async () => {
    renderWithProviders();
    await act(async () => {});

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
    expect(root.classList.contains(root.getAttribute('data-theme') as string)).toBe(true);
  });

  it('switching to light updates resolvedTheme and the DOM immediately', async () => {
    renderWithProviders();
    await act(async () => {
      fireEvent.click(screen.getByText('go-light'));
    });

    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('switching to dark updates resolvedTheme and the DOM immediately', async () => {
    renderWithProviders();
    await act(async () => {
      fireEvent.click(screen.getByText('go-dark'));
    });

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the chosen theme to localStorage under both the per-user/guest key and the global backup key', async () => {
    renderWithProviders();
    await act(async () => {
      fireEvent.click(screen.getByText('go-light'));
    });

    expect(localStorage.getItem('docai_guest_theme')).toBe('light');
    expect(localStorage.getItem('docai_theme')).toBe('light');
  });

  it('rehydrates a previously-persisted theme on next mount', async () => {
    localStorage.setItem('docai_guest_theme', 'light');
    renderWithProviders();
    await act(async () => {});

    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });
});
