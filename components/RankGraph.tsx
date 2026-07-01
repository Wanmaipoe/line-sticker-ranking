'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { COUNTRY_MAP } from '@/lib/countries';

interface DataPoint {
  country: string;
  snapshot_date: string;
  snapshot_hour: number;
  rank: number;
}

interface Props {
  // 30-day history for EVERY country, fetched once server-side. Both views (all / each)
  // filter this in-memory, so switching view or country costs zero DB reads.
  allData: DataPoint[];
  selectedCountry: string;
  viewMode: 'all' | 'each';
  onViewModeChange: (m: 'all' | 'each') => void;
}

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'] as const;
const COLORS: Record<string, string> = {
  jp: '#ef4444', th: '#06c755', tw: '#3b82f6', id: '#f59e0b', us: '#8b5cf6',
};
const HOURLY_WINDOW_H = 48;

function dayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
function hourLabel(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function slotTime(date: string, hour: number) {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
}

// Best (lowest) rank per day for one country's points.
function bestPerDay(points: DataPoint[]): { date: string; rank: number }[] {
  const byDay: Record<string, number> = {};
  for (const p of points) {
    if (byDay[p.snapshot_date] == null || p.rank < byDay[p.snapshot_date]) byDay[p.snapshot_date] = p.rank;
  }
  return Object.entries(byDay)
    .map(([date, rank]) => ({ date, rank }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function RankGraph({ allData, selectedCountry, viewMode, onViewModeChange }: Props) {
  const [freq, setFreq] = useState<'daily' | 'hourly'>('daily');

  const present = FEATURED.filter((cc) => allData.some((d) => d.country === cc));
  const uniqueDates = new Set(allData.map((d) => d.snapshot_date)).size;
  const uniqueSlots = new Set(allData.map((d) => `${d.snapshot_date}-${d.snapshot_hour}`)).size;
  const hasHourly = uniqueSlots > uniqueDates;

  const countriesToShow = viewMode === 'all' ? present : [selectedCountry];

  // Merge each shown country's points into rows keyed by time slot, one column per country.
  const rowMap = new Map<string, { t: number; label: string; [cc: string]: number | string }>();
  for (const cc of countriesToShow) {
    const pts = allData.filter((d) => d.country === cc);
    if (freq === 'daily') {
      for (const d of bestPerDay(pts)) {
        const key = d.date;
        let row = rowMap.get(key);
        if (!row) { row = { t: Date.parse(`${d.date}T12:00:00Z`), label: dayLabel(d.date) }; rowMap.set(key, row); }
        row[cc] = d.rank;
      }
    } else {
      const cutoff = Date.now() - HOURLY_WINDOW_H * 3_600_000;
      const window = pts
        .filter((d) => slotTime(d.snapshot_date, d.snapshot_hour) >= cutoff)
        .sort((a, b) => slotTime(a.snapshot_date, a.snapshot_hour) - slotTime(b.snapshot_date, b.snapshot_hour));
      for (const d of window) {
        const key = `${d.snapshot_date}#${d.snapshot_hour}`;
        let row = rowMap.get(key);
        if (!row) { row = { t: slotTime(d.snapshot_date, d.snapshot_hour), label: hourLabel(d.snapshot_date, d.snapshot_hour) }; rowMap.set(key, row); }
        row[cc] = d.rank;
      }
    }
  }
  const chartRows = [...rowMap.values()].sort((a, b) => a.t - b.t);

  const allRanks = chartRows.flatMap((r) => countriesToShow.map((cc) => r[cc]).filter((v): v is number => typeof v === 'number'));
  const minRank = allRanks.length ? Math.min(...allRanks) : 1;
  const maxRank = allRanks.length ? Math.max(...allRanks) : 50;

  // Trend badge only makes sense for a single country.
  let trend: { dir: 'up' | 'down' | 'flat'; diff: number } | null = null;
  if (viewMode === 'each') {
    const series = chartRows.map((r) => r[selectedCountry]).filter((v): v is number => typeof v === 'number');
    if (series.length > 1) {
      const first = series[0], last = series[series.length - 1];
      trend = { dir: last < first ? 'up' : last > first ? 'down' : 'flat', diff: Math.abs(first - last) };
    }
  }

  const selInfo = COUNTRY_MAP[selectedCountry];
  const noData = countriesToShow.every((cc) => !allData.some((d) => d.country === cc));

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {viewMode === 'all' ? (
          <div className="flex-1 min-w-[120px]">
            <p className="font-semibold text-sm">🌏 All countries</p>
            <p className="text-xs text-gray-400">
              {freq === 'daily' ? 'Last 30 days' : `Last ${HOURLY_WINDOW_H}h · hourly`}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[120px]">
            <span className="text-2xl">{selInfo?.flag ?? '🌏'}</span>
            <div>
              <p className="font-semibold text-sm">{selInfo?.name ?? selectedCountry.toUpperCase()}</p>
              <p className="text-xs text-gray-400">
                {freq === 'daily' ? 'Last 30 days' : `Last ${HOURLY_WINDOW_H}h · hourly`}
              </p>
            </div>
          </div>
        )}

        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.dir === 'up' ? 'bg-green-100 text-green-700'
                : trend.dir === 'down' ? 'bg-red-100 text-red-500'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {trend.dir === 'up' ? `↑ Up ${trend.diff}` : trend.dir === 'down' ? `↓ Down ${trend.diff}` : '— Flat'}
          </span>
        )}

        {/* All / Each toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => onViewModeChange('all')}
            className={`px-2.5 py-1 transition-colors ${viewMode === 'all' ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            All Country
          </button>
          <button
            onClick={() => onViewModeChange('each')}
            className={`px-2.5 py-1 transition-colors ${viewMode === 'each' ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Each country
          </button>
        </div>

        {/* Daily / Hourly toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setFreq('daily')}
            className={`px-2.5 py-1 transition-colors ${freq === 'daily' ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Daily
          </button>
          <button
            onClick={() => setFreq('hourly')}
            disabled={!hasHourly}
            className={`px-2.5 py-1 transition-colors ${
              freq === 'hourly' ? 'bg-green-500 text-white'
                : hasHourly ? 'bg-white text-gray-500 hover:bg-gray-50'
                : 'bg-white text-gray-300 cursor-not-allowed'
            }`}
            title={!hasHourly ? 'No recent hourly data yet' : undefined}
          >
            Hourly
          </button>
        </div>
      </div>

      {/* Legend (all-country only) */}
      {viewMode === 'all' && present.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {present.map((cc) => (
            <span key={cc} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: COLORS[cc] }} />
              {COUNTRY_MAP[cc]?.flag} {COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {noData || chartRows.length === 0 ? (
        <div className="flex items-center justify-center h-44 text-sm text-gray-400">
          {noData ? 'No history data for this view yet.' : `No ${freq} snapshots yet — it fills in as the scraper runs.`}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartRows} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
            <YAxis
              reversed
              domain={[Math.max(1, minRank - 2), maxRank + 2]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `#${v}`}
              width={34}
            />
            <Tooltip
              formatter={(value, name) => [`#${value}`, COUNTRY_MAP[name as string]?.name ?? String(name)]}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            {viewMode === 'each' && minRank <= 3 && (
              <ReferenceLine
                y={minRank}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                label={{ value: `Best #${minRank}`, fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }}
              />
            )}
            {countriesToShow.map((cc) => (
              <Line
                key={cc}
                type="monotone"
                dataKey={cc}
                name={cc}
                stroke={viewMode === 'all' ? (COLORS[cc] ?? '#06c755') : '#06c755'}
                strokeWidth={2.5}
                connectNulls
                dot={{ r: 2.5, strokeWidth: 0, fill: viewMode === 'all' ? (COLORS[cc] ?? '#06c755') : '#06c755' }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
