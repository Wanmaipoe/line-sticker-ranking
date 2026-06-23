'use client';

import { COUNTRY_MAP } from '@/lib/countries';

interface RankRow {
  country: string;
  current_rank: number;
  snapshot_date: string;
  snapshot_hour: number;
  rank_24h_ago: number | null;
  best_30d: number | null;
}

interface Props {
  rows: RankRow[];
  selectedCountry: string;
  onSelectCountry: (code: string) => void;
}

function delta(current: number, prev: number | null) {
  if (prev === null) return <span className="text-gray-300">—</span>;
  const diff = prev - current;
  if (diff > 0)
    return <span className="text-green-500 font-semibold">▲{diff}</span>;
  if (diff < 0)
    return <span className="text-red-400 font-semibold">▼{Math.abs(diff)}</span>;
  return <span className="text-gray-400">—</span>;
}

function freshnessLabel(date: string, hour: number) {
  const snap = new Date(`${date}T${String(hour).padStart(2, '0')}:30:00Z`);
  const diffMin = Math.round((Date.now() - snap.getTime()) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function rankColor(rank: number) {
  if (rank === 1) return 'text-yellow-500 font-bold';
  if (rank <= 3) return 'text-orange-400 font-bold';
  if (rank <= 10) return 'text-green-600 font-semibold';
  return 'text-gray-600';
}

export default function GlobalRankTable({ rows, selectedCountry, onSelectCountry }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2.5">Country</th>
            <th className="text-center px-3 py-2.5">Current</th>
            <th className="text-center px-3 py-2.5">Δ24h</th>
            <th className="text-center px-3 py-2.5">Best 30d</th>
            <th className="text-center px-3 py-2.5">Freshness</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
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
                className={`cursor-pointer border-t border-gray-50 transition-colors hover:bg-green-50 ${
                  isSelected ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info?.flag ?? '🌏'}</span>
                    <span className="font-medium text-gray-700">{info?.name ?? row.country.toUpperCase()}</span>
                  </div>
                </td>
                <td className={`text-center px-3 py-3 ${rankColor(row.current_rank)}`}>
                  #{row.current_rank}
                </td>
                <td className="text-center px-3 py-3">
                  {delta(row.current_rank, row.rank_24h_ago)}
                </td>
                <td className="text-center px-3 py-3 text-gray-500">
                  {row.best_30d != null ? `#${row.best_30d}` : '—'}
                </td>
                <td className="text-center px-3 py-3 text-gray-400 text-xs">
                  {freshnessLabel(row.snapshot_date, row.snapshot_hour)}
                </td>
                <td className="px-3 py-3 text-right text-xs text-green-500">
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
