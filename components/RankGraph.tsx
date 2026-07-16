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
  ReferenceArea,
} from 'recharts';
import { COUNTRY_MAP } from '@/lib/countries';

interface DataPoint {
  country: string;
  snapshot_date: string;
  snapshot_hour: number;
  // Minute the snapshot was actually captured (the scrape runs around :30, but not exactly — some
  // runs land at :08 etc). snapshot_hour alone is just the hour bucket, so labelling points at
  // hour:00 read up to an hour earlier than reality. Optional: older callers may omit it.
  snapshot_minute?: number;
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
const pad = (n: number) => String(n).padStart(2, '0');

function hourLabel(date: string, hour: number, minute = 0) {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00Z`).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function slotTime(date: string, hour: number, minute = 0) {
  return Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`);
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

// A few evenly-spaced, rounded rank ticks between lo and hi (for the "over 500" case, where we
// take manual control of the Y axis so the sentinel tick can be added).
function axisTicks(lo: number, hi: number): number[] {
  if (hi <= lo) return [Math.round(lo)];
  const n = 4;
  const step = (hi - lo) / (n - 1);
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round(lo + step * i)))];
}

type Row = { t: number; label: string } & Record<string, number | string>;

export default function RankGraph({ allData, selectedCountry, viewMode, onViewModeChange }: Props) {
  const [freq, setFreq] = useState<'daily' | 'hourly'>('daily');

  const present = FEATURED.filter((cc) => allData.some((d) => d.country === cc));
  const uniqueDates = new Set(allData.map((d) => d.snapshot_date)).size;
  const uniqueSlots = new Set(allData.map((d) => `${d.snapshot_date}-${d.snapshot_hour}`)).size;
  const hasHourly = uniqueSlots > uniqueDates;

  const countriesToShow = viewMode === 'all' ? present : [selectedCountry];

  // Build the GLOBAL time domain from ALL countries — this is effectively the snapshot calendar,
  // because every country is scraped together each hour. So if a shown country is MISSING at one of
  // these times, it was out of the top 500 then (we only track the top 500), and we can plot it in
  // an "Over #500" band instead of hiding the drop with connectNulls. All in-memory, zero reads.
  const domain: { key: string; t: number; label: string }[] = [];
  const seriesByCc = new Map<string, Map<string, number>>(); // cc → (time-key → rank)

  if (freq === 'daily') {
    for (const date of [...new Set(allData.map((d) => d.snapshot_date))].sort((a, b) => a.localeCompare(b))) {
      domain.push({ key: date, t: Date.parse(`${date}T12:00:00Z`), label: dayLabel(date) });
    }
    for (const cc of countriesToShow) {
      const m = new Map<string, number>();
      for (const { date, rank } of bestPerDay(allData.filter((d) => d.country === cc))) m.set(date, rank);
      seriesByCc.set(cc, m);
    }
  } else {
    // Read-only "last 48h" cutoff for display; a few ms of drift across re-renders is harmless.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - HOURLY_WINDOW_H * 3_600_000;
    // Key on the HOUR bucket (not the minute) so every country's point for a given scrape lands on
    // the same x slot — the all-country merge and the "Over #500" gap detection depend on that.
    // The minute is only used to place/label the slot at the real capture time.
    const keyOf = (d: DataPoint) => `${d.snapshot_date}#${d.snapshot_hour}`;
    const inWin = allData.filter((d) => slotTime(d.snapshot_date, d.snapshot_hour, d.snapshot_minute) >= cutoff);
    const slots = [...new Map(inWin.map((d) => [keyOf(d), d])).values()].sort(
      (a, b) => slotTime(a.snapshot_date, a.snapshot_hour, a.snapshot_minute) - slotTime(b.snapshot_date, b.snapshot_hour, b.snapshot_minute)
    );
    for (const d of slots) {
      domain.push({
        key: keyOf(d),
        t: slotTime(d.snapshot_date, d.snapshot_hour, d.snapshot_minute),
        label: hourLabel(d.snapshot_date, d.snapshot_hour, d.snapshot_minute),
      });
    }
    for (const cc of countriesToShow) {
      const m = new Map<string, number>();
      for (const d of inWin.filter((x) => x.country === cc)) m.set(keyOf(d), d.rank);
      seriesByCc.set(cc, m);
    }
  }

  // Real rank range (excludes the "over 500" markers).
  const realRanks: number[] = [];
  for (const { key } of domain) {
    for (const cc of countriesToShow) {
      const r = seriesByCc.get(cc)?.get(key);
      if (typeof r === 'number') realRanks.push(r);
    }
  }
  const minRank = realRanks.length ? Math.min(...realRanks) : 1;
  const maxRank = realRanks.length ? Math.max(...realRanks) : 50;

  // Does any shown country with data drop out of the top 500 somewhere in the domain?
  const hasOverflow = domain.some(({ key }) =>
    countriesToShow.some((cc) => {
      const m = seriesByCc.get(cc);
      return m && m.size > 0 && m.get(key) == null;
    })
  );
  // "Over #500" sits just below the worst real rank so it never squashes the real range on a top
  // sticker that only occasionally drops out.
  const overLevel = Math.round(maxRank + Math.max(8, (maxRank - minRank) * 0.25));
  const zoneTop = Math.round(maxRank + Math.max(4, (overLevel - maxRank) * 0.35)); // divider between real + over-500

  const chartRows: Row[] = domain.map(({ t, label, key }) => {
    const row: Row = { t, label };
    for (const cc of countriesToShow) {
      const m = seriesByCc.get(cc);
      const r = m?.get(key);
      if (typeof r === 'number') row[cc] = r;
      else if (hasOverflow && m && m.size > 0) row[cc] = overLevel; // present here otherwise → out of top 500
      // else: leave the cell unset (country genuinely has no data in this view)
    }
    return row;
  });

  // Trend badge (single country) — from REAL ranks only, ignoring over-500 sentinels.
  let trend: { dir: 'up' | 'down' | 'flat'; diff: number } | null = null;
  if (viewMode === 'each') {
    const m = seriesByCc.get(selectedCountry);
    const series = domain.map((d) => m?.get(d.key)).filter((v): v is number => typeof v === 'number');
    if (series.length > 1) {
      const first = series[0], last = series[series.length - 1];
      trend = { dir: last < first ? 'up' : last > first ? 'down' : 'flat', diff: Math.abs(first - last) };
    }
  }

  const selInfo = COUNTRY_MAP[selectedCountry];
  const noData = countriesToShow.every((cc) => !allData.some((d) => d.country === cc));

  const yDomain: [number, number] = [
    Math.max(1, minRank - 2),
    hasOverflow ? overLevel + Math.max(3, Math.round((overLevel - maxRank) * 0.3)) : maxRank + 2,
  ];
  const yTicks = hasOverflow ? [...axisTicks(minRank, maxRank), overLevel] : undefined;

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

      {hasOverflow && (
        <p className="text-[11px] text-gray-400 mb-1">
          A line dropping into the <span className="text-red-400 font-medium">Over&nbsp;#500</span> band means the sticker
          fell out of that country&apos;s top 500 (we only track the top 500).
        </p>
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
              domain={yDomain}
              ticks={yTicks}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => (hasOverflow && v === overLevel ? 'Over 500' : `#${v}`)}
              width={hasOverflow ? 50 : 34}
            />
            <Tooltip
              formatter={(value, name) => [
                hasOverflow && value === overLevel ? 'Over #500' : `#${value}`,
                COUNTRY_MAP[name as string]?.name ?? String(name),
              ]}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            {/* Shaded "out of top 500" zone at the bottom. */}
            {hasOverflow && (
              <ReferenceArea
                y1={zoneTop}
                y2={yDomain[1]}
                fill="#fef2f2"
                fillOpacity={0.7}
                ifOverflow="extendDomain"
                label={{ value: 'Over #500', fontSize: 10, fill: '#ef4444', position: 'insideBottomLeft' }}
              />
            )}
            {viewMode === 'each' && !hasOverflow && minRank <= 3 && (
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
