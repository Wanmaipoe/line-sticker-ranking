'use client';

import { useState } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP, COUNTRY_ORDER } from '@/lib/countries';

interface Slot {
  id: string;
  name: string;
  country: string;
  rank: number;
}

interface Creator {
  author: string;
  chart_entries: number;
  distinct_stickers: number;
  countries: number;
  best_rank: number;
  by_country: Record<string, number>;
  slots: Slot[];
  sample_id: string;
  sample_name: string;
  sample_image: string | null;
}

interface Boards {
  all: Creator[];
  jp: Creator[];
  th: Creator[];
  tw: Creator[];
}

type Scope = 'all' | 'jp' | 'th' | 'tw';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'jp', label: '🇯🇵 JP' },
  { key: 'th', label: '🇹🇭 TH' },
  { key: 'tw', label: '🇹🇼 TW' },
];

const COLUMN_HINTS: Record<string, string> = {
  slots: 'Total slots = each pack × each country it charts in, within the latest top 100. Hover a number for the breakdown.',
  packs: 'How many distinct sticker packs of theirs are charting',
  countries: 'How many of the 3 markets (JP, TH, TW) they chart in',
  best: 'Best (lowest) rank any of their packs has reached',
};

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500 font-bold';
  if (rank <= 3) return 'text-orange-400 font-semibold';
  if (rank <= 10) return 'text-green-600 font-semibold';
  return 'text-gray-600';
}

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

function TooltipTh({ hintKey, label, className }: { hintKey: string; label: string; className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <th
      className={`relative cursor-help select-none ${className ?? ''}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <span className="border-b border-dotted border-gray-300">{label}</span>
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-lg z-50 shadow-lg font-normal normal-case tracking-normal text-center">
          {COLUMN_HINTS[hintKey]}
        </div>
      )}
    </th>
  );
}

function SlotsCell({ creator }: { creator: Creator }) {
  const [show, setShow] = useState(false);
  const parts = Object.entries(creator.by_country).sort(
    (a, b) => (COUNTRY_ORDER[a[0]] ?? 99) - (COUNTRY_ORDER[b[0]] ?? 99)
  );
  return (
    <td
      className="relative px-3 py-3 text-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <span className="font-semibold text-green-600 cursor-help border-b border-dotted border-green-300">
        {creator.chart_entries}
      </span>
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 text-xs rounded-lg z-50 shadow-lg py-1.5 px-1 w-36 text-left">
          {parts.map(([cc, n]) => (
            <div key={cc} className="flex items-center justify-between px-2 py-0.5">
              <span className="text-gray-600">
                {COUNTRY_MAP[cc]?.flag} {COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}
              </span>
              <span className="font-semibold text-gray-700">{n}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-2 py-0.5 mt-0.5 border-t border-gray-100 pt-1">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-green-600">{creator.chart_entries}</span>
          </div>
        </div>
      )}
    </td>
  );
}

function PacksCell({ creator, hideOnMobile, primary }: { creator: Creator; hideOnMobile?: boolean; primary?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <td
      className={`relative px-3 py-3 text-center ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <span
        className={`cursor-help border-b border-dotted ${
          primary ? 'font-semibold text-green-600 border-green-300' : 'text-gray-600 border-gray-300'
        }`}
      >
        {creator.distinct_stickers}
      </span>
      {show && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg z-50 shadow-lg w-72 max-h-64 overflow-y-auto text-left">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-gray-400">
              <tr>
                <th className="text-left px-2.5 py-1.5 font-medium">Pack</th>
                <th className="px-1 py-1.5 font-medium">Country</th>
                <th className="text-right px-2.5 py-1.5 font-medium">Rank</th>
              </tr>
            </thead>
            <tbody>
              {creator.slots.map((s, i) => (
                <tr key={`${s.id}-${s.country}-${i}`} className="border-t border-gray-50">
                  <td className="px-2.5 py-1 text-gray-600 truncate max-w-[130px]">{s.name}</td>
                  <td className="px-1 py-1 text-center">{COUNTRY_MAP[s.country]?.flag ?? s.country.toUpperCase()}</td>
                  <td className={`px-2.5 py-1 text-right ${rankClass(s.rank)}`}>#{s.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </td>
  );
}

function CountriesCell({ creator }: { creator: Creator }) {
  const [show, setShow] = useState(false);
  const list = Object.keys(creator.by_country).sort(
    (a, b) => (COUNTRY_ORDER[a] ?? 99) - (COUNTRY_ORDER[b] ?? 99)
  );
  return (
    <td
      className="relative px-3 py-3 text-center hidden sm:table-cell"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <span className="text-gray-600 cursor-help border-b border-dotted border-gray-300">{creator.countries}</span>
      {show && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg z-50 shadow-lg py-1.5 w-44 text-left">
          {list.map((cc) => (
            <div key={cc} className="flex items-center justify-between px-3 py-0.5 text-xs text-gray-600">
              <span>{COUNTRY_MAP[cc]?.flag} {COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}</span>
              <span className="text-gray-400">{creator.by_country[cc]}</span>
            </div>
          ))}
        </div>
      )}
    </td>
  );
}

export default function CreatorsLeaderboard({ boards: initialBoards }: { boards: Boards }) {
  const [scope, setScope] = useState<Scope>('all');
  // The page is ISR-cached (up to ~30 min behind the hourly scrape). Refresh pulls the live
  // standings on demand; it ONLY fires on an explicit click, so reads (~300 index-seek rows via
  // /api/creators) are spent per-click, never in the background. The selected market persists.
  const [boards, setBoards] = useState<Boards>(initialBoards);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return; // guard against double / spam clicks so one intent = one read
    setRefreshing(true);
    try {
      const res = await fetch('/api/creators');
      const data = await res.json();
      if (data.boards) setBoards(data.boards);
    } catch {
      // keep the current data on any failure
    } finally {
      setRefreshing(false);
    }
  }

  const creators = boards[scope];
  const isAll = scope === 'all';
  const colSpan = isAll ? 6 : 4;

  return (
    <div className="mt-4">
      {/* Refresh + market filter */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Fetch the latest rankings now"
          className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {refreshing ? 'Loading…' : '↻ Refresh'}
        </button>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-3 py-1.5 transition-colors ${
                scope === s.key ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 w-12">#</th>
              <th className="text-left px-2 py-2.5">Creator</th>
              {isAll && <TooltipTh hintKey="slots" label="Chart slots" className="text-center px-3 py-2.5" />}
              <TooltipTh
                hintKey="packs"
                label="Packs"
                className={`text-center px-3 py-2.5 ${isAll ? 'hidden sm:table-cell' : ''}`}
              />
              {isAll && <TooltipTh hintKey="countries" label="Countries" className="text-center px-3 py-2.5 hidden sm:table-cell" />}
              <TooltipTh hintKey="best" label="Best" className="text-center px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {creators.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="text-center py-10 text-gray-400 text-sm">
                  No data yet
                </td>
              </tr>
            )}
            {creators.map((c, i) => (
              <tr key={c.author} className="border-t border-gray-50 hover:bg-green-50 transition-colors">
                <td className="px-4 py-3 text-center font-bold text-gray-400">{medal(i) ?? i + 1}</td>
                <td className="px-2 py-3">
                  <a href={`/creator/${encodeURIComponent(c.author)}`} className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                      <Image
                        src={
                          c.sample_image ??
                          `https://stickershop.line-scdn.net/stickershop/v1/product/${c.sample_id}/LINEStorePC/main.png`
                        }
                        alt={c.author}
                        width={36}
                        height={36}
                        className="object-contain w-full h-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 truncate group-hover:text-green-700">{c.author}</p>
                      <p className="text-xs text-gray-400 truncate">{c.sample_name}</p>
                    </div>
                  </a>
                </td>
                {isAll && <SlotsCell creator={c} />}
                <PacksCell creator={c} hideOnMobile={isAll} primary={!isAll} />
                {isAll && <CountriesCell creator={c} />}
                <td className="px-3 py-3 text-center">
                  <span className={rankClass(c.best_rank)}>#{c.best_rank}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
