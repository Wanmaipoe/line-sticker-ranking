'use client';

import { useSyncExternalStore } from 'react';

// Live "is the app in dark mode?" for client components. The <html> `.dark` class is the single
// source of truth (set pre-paint by the inline script in app/layout.tsx and toggled by
// ThemeToggle). We subscribe to class changes so anything reading this — chart colors, the toggle
// icon — re-renders the instant the theme flips, with no reload.
export type Theme = 'light' | 'dark';

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // The effective theme can also change from the OS side (when there's no manual override), so watch
  // the media query too — otherwise charts wouldn't recolor if the visitor flips their OS theme.
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => {
    observer.disconnect();
    mq.removeEventListener('change', callback);
  };
}

// The EFFECTIVE theme, matching the CSS in globals.css exactly: an explicit .dark/.light class on
// <html> wins; with no override, fall back to the OS preference. Reading the class alone would be
// wrong for a system-dark visitor (who has no .dark class) — charts would render light-on-dark.
function getSnapshot(): Theme {
  const el = document.documentElement;
  if (el.classList.contains('dark')) return 'dark';
  if (el.classList.contains('light')) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Server (and the first hydration render) always assume light — the same assumption the server HTML
// was built with — so hydration matches. useSyncExternalStore then re-reads the real class after
// mount and re-renders if the visitor is actually in dark mode.
function getServerSnapshot(): Theme {
  return 'light';
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// recharts renders stroke/fill/tick colors as SVG *attributes*, which can't resolve CSS var() — so
// charts resolve their chrome colors here in JS instead. KEEP THESE IN SYNC with the --chart-*
// variables in app/globals.css. Data-identity colors (country series, revenue owner palette) are
// deliberately NOT here: they stay identical across themes and live with their components.
export interface ChartColors {
  grid: string;
  axis: string;
  axisLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  legend: string;
}

const CHART_LIGHT: ChartColors = {
  grid: '#f0f0f0',
  axis: '#9ca3af',
  axisLine: '#e5e7eb',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e5e7eb',
  tooltipText: '#374151',
  legend: '#64748b',
};

const CHART_DARK: ChartColors = {
  grid: '#1f2937',
  axis: '#9ca3af',
  axisLine: '#374151',
  tooltipBg: '#1f2937',
  tooltipBorder: '#374151',
  tooltipText: '#e5e7eb',
  legend: '#9ca3af',
};

export function useChartColors(): ChartColors {
  return useTheme() === 'dark' ? CHART_DARK : CHART_LIGHT;
}
