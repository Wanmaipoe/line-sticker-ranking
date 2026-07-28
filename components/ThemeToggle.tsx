'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useTheme } from '@/lib/theme';

// useLayoutEffect on the client (fires before the browser paints, so no flash); useEffect on the
// server render (a no-op that avoids React's "useLayoutEffect does nothing on the server" warning).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Global light/dark switch. Rendered once in the root layout, fixed bottom-left (clear of the
// AdPopup FAB at bottom-right). Clicking sets an EXPLICIT `.dark`/`.light` class on <html> (which
// overrides the OS preference in either direction), keeps color-scheme in sync (so native form
// controls repaint), and persists the choice to localStorage so it survives reloads. With no stored
// choice and no class, the CSS media query mirrors the OS on its own.
export default function ThemeToggle() {
  const theme = useTheme();

  // React 19 wipes any class the pre-paint script added to <html> when it hydrates the document, so
  // a saved override has to be RE-APPLIED after hydration. This runs before the first post-hydration
  // paint, and the pre-paint script covered the paint before that, so the override never flashes.
  // No saved choice => nothing to do; the CSS media query already follows the OS.
  useIsomorphicLayoutEffect(() => {
    try {
      const t = localStorage.getItem('theme');
      if (t !== 'dark' && t !== 'light') return;
      const el = document.documentElement;
      if (!el.classList.contains(t)) {
        el.classList.remove('light', 'dark');
        el.classList.add(t);
        el.style.colorScheme = t;
      }
    } catch {
      /* localStorage unavailable — fall back to the OS via the CSS media query */
    }
  }, []);

  function toggle() {
    const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    const el = document.documentElement;
    el.classList.remove('light', 'dark');
    el.classList.add(next);
    el.style.colorScheme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* localStorage unavailable (private mode) — the class still flips for this page view */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed bottom-4 left-4 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md text-base text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
