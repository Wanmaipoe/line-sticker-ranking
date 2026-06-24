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

const COLUMN_HINTS: Record<string, string> = {
  slots: 'Total slots = each sticker × each country it charts in, within the latest top 100. Hover a number for the breakdown.',
  packs: 'How many distinct sticker packs of theirs are charting',
  countries: 'How many of the 5 markets (JP, TH, TW, ID, US) they chart in',
  best: 'Best (lowest) rank any of their packs has reached',
};

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

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500 font-bold';
  if (rank <= 3) return 'text-orange-400 font-semibold';
  if (rank <= 10) return 'text-green-600 font-semibold';
  return 'text-gray-600';
}

function PacksCell({ creator }: { creator: Creator }) {
  const [show, setShow] = useState(false);
  return (
    <td
      className="relative px-3 py-3 text-center hidden sm:table-cell"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <span className="text-gray-600 cursor-help border-b border-dotted border-gray-300">{creator.distinct_stickers}</span>
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

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

export default function CreatorsLeaderboard({ creators }: { creators: Creator[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2.5 w-12">#</th>
            <th className="text-left px-2 py-2.5">Creator</th>
            <TooltipTh hintKey="slots" label="Chart slots" className="text-center px-3 py-2.5" />
            <TooltipTh hintKey="packs" label="Packs" className="text-center px-3 py-2.5 hidden sm:table-cell" />
            <TooltipTh hintKey="countries" label="Countries" className="text-center px-3 py-2.5 hidden sm:table-cell" />
            <TooltipTh hintKey="best" label="Best" className="text-center px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {creators.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
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
              <SlotsCell creator={c} />
              <PacksCell creator={c} />
              <CountriesCell creator={c} />
              <td className="px-3 py-3 text-center">
                <span
                  className={
                    c.best_rank === 1
                      ? 'text-yellow-500 font-bold'
                      : c.best_rank <= 3
                      ? 'text-orange-400 font-semibold'
                      : c.best_rank <= 10
                      ? 'text-green-600'
                      : 'text-gray-500'
                  }
                >
                  #{c.best_rank}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
