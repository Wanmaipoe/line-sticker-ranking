'use client';

import { useState, useSyncExternalStore } from 'react';
import { COUNTRY_MAP } from '@/lib/countries';

const COLUMN_HINTS: Record<string, string> = {
  current: 'Rank in this country right now. "—" means it has dropped out of the top 500',
  delta24h: 'Change vs. yesterday — ▲ means rank improved',
  best30d: 'Best (lowest) rank reached in the past 30 days',
  freshness: 'How long ago this country was last seen ranking this sticker',
};

interface RankRow {
  country: string;
  current_rank: number;
  snapshot_date: string;
  snapshot_hour: number;
  snapshot_minute?: number; // real capture minute, from created_at (see minuteOf in lib/db.ts)
  rank_24h_ago: number | null;
  best_30d: number | null;
  is_current: boolean;
}

interface Props {
  rows: RankRow[];
  selectedCountry: string;
  onSelectCountry: (code: string) => void;
}

function delta(current: number, prev: number | null) {
  if (prev === null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const diff = prev - current;
  if (diff > 0)
    return <span className="text-green-500 dark:text-green-400 font-semibold">▲{diff}</span>;
  if (diff < 0)
    return <span className="text-red-400 dark:text-red-400 font-semibold">▼{Math.abs(diff)}</span>;
  return <span className="text-gray-400 dark:text-gray-500">—</span>;
}

const MINUTE_MS = 60_000;

// Freshness depends on the clock, and this table is server-rendered into ISR HTML that is served for
// 30 minutes or more — so a label computed on the server disagrees with the one the browser computes
// while hydrating (React #418, seen on production). The server snapshot is null, so SSR and the
// hydration pass render a blank cell; React then re-renders with the browser's clock. The clock is
// whole minutes since the epoch, a primitive, so React only re-renders when the minute actually turns.
function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, 15_000);
  return () => clearInterval(id);
}
function getNowMinute(): number | null {
  return Math.floor(Date.now() / MINUTE_MS);
}
function getServerNowMinute(): number | null {
  return null;
}

// From the snapshot's real capture minute. This used to assume every snapshot lands at :30, but a
// quarter of them don't (anywhere from :00 to :57), so right after an early capture the label went
// negative ("-5m ago") and was otherwise up to half an hour off.
function freshnessLabel(row: RankRow, nowMinute: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const captured = Date.parse(`${row.snapshot_date}T${pad(row.snapshot_hour)}:${pad(row.snapshot_minute ?? 0)}:00Z`);
  const diffMin = nowMinute - captured / MINUTE_MS;
  if (!Number.isFinite(diffMin)) return '';
  if (diffMin < 1) return 'just now'; // also absorbs a viewer's clock running slightly behind the scraper's
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function rankColor(rank: number) {
  if (rank === 1) return 'text-yellow-500 dark:text-yellow-400 font-bold';
  if (rank <= 3) return 'text-orange-400 dark:text-orange-300 font-bold';
  if (rank <= 10) return 'text-green-600 dark:text-green-400 font-semibold';
  return 'text-gray-600 dark:text-gray-300';
}

function TooltipTh({ colKey, label, className }: { colKey: string; label: string; className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <th
      className={`relative cursor-help select-none ${className ?? ''}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      {label}
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-gray-800 dark:bg-gray-700 dark:ring-1 dark:ring-gray-600 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap z-50 shadow-lg font-normal normal-case tracking-normal">
          {COLUMN_HINTS[colKey]}
        </div>
      )}
    </th>
  );
}

export default function GlobalRankTable({ rows, selectedCountry, onSelectCountry }: Props) {
  const nowMinute = useSyncExternalStore(subscribeClock, getNowMinute, getServerNowMinute);
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="text-left px-4 py-2.5">Country</th>
            <TooltipTh colKey="current" label="Current" className="text-center px-3 py-2.5" />
            <TooltipTh colKey="delta24h" label="Δ24h" className="text-center px-3 py-2.5" />
            <TooltipTh colKey="best30d" label="Best 30d" className="text-center px-3 py-2.5" />
            <TooltipTh colKey="freshness" label="Freshness" className="text-center px-3 py-2.5" />
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                No data yet — wait for the cron job or run the seed script
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const info = COUNTRY_MAP[row.country];
            const isSelected = row.country === selectedCountry;
            return (
              <tr
                key={row.country}
                onClick={() => onSelectCountry(row.country)}
                className={`cursor-pointer border-t border-gray-50 dark:border-gray-800 transition-colors hover:bg-green-50 dark:hover:bg-green-500/10 ${
                  isSelected ? 'bg-green-50 dark:bg-green-500/10 border-l-2 border-l-green-500' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info?.flag ?? '🌏'}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-200">{info?.name ?? row.country.toUpperCase()}</span>
                  </div>
                </td>
                <td
                  className={`text-center px-3 py-3 ${
                    row.is_current ? rankColor(row.current_rank) : 'text-gray-300 dark:text-gray-600'
                  }`}
                >
                  {row.is_current ? `#${row.current_rank}` : '—'}
                </td>
                <td className="text-center px-3 py-3">
                  {row.is_current ? (
                    delta(row.current_rank, row.rank_24h_ago)
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>
                <td className="text-center px-3 py-3 text-gray-500 dark:text-gray-400">
                  {row.best_30d != null ? `#${row.best_30d}` : '—'}
                </td>
                <td className="text-center px-3 py-3 text-gray-400 dark:text-gray-500 text-xs">
                  {nowMinute === null ? ' ' : freshnessLabel(row, nowMinute)}
                </td>
                <td className="px-3 py-3 text-right text-xs text-green-500 dark:text-green-400">
                  {isSelected ? '▶ Graph' : 'View →'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
