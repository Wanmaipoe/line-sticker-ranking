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
  ReferenceArea,
} from 'recharts';
import { COUNTRY_MAP, COUNTRY_ORDER } from '@/lib/countries';
import { useChartColors, useTheme } from '@/lib/theme';

export interface CreatorGraphPoint {
  product_id: string;
  country: string;
  snapshot_date: string;
  snapshot_hour: number;
  snapshot_minute?: number;
  rank: number;
}

export interface CreatorGraphPack {
  id: string;
  name: string;
}

interface Props {
  // Top packs PER COUNTRY (server-capped, best current rank first in each market). Chosen per
  // country because a single global top-N is dominated by the creator's strongest market and
  // starves the others.
  packsByCountry: Record<string, CreatorGraphPack[]>;
  // History for the UNION of those packs, fetched once server-side. Switching country filters this
  // in memory, so it costs zero extra DB reads (same trick as the sticker page).
  history: CreatorGraphPoint[];
  // Country the creator has the most currently-ranked packs in.
  defaultCountry: string;
  // Packs ranked in each country, for the "showing N of M" note.
  rankedByCountry: Record<string, number>;
}

// An ORDERED ramp, not an arbitrary palette: the colour encodes rank position (best -> worst), so
// the legend reads as a gradient and you can tell roughly where a line sits without tracing it.
// Hue runs violet -> blue -> teal -> green -> lime -> gold. That progression survives red/green
// colour blindness (a true red-to-violet rainbow collapses at both ends) and is perceptually even,
// so no mid-rank line visually shouts louder than #1 the way rainbow yellow does.
// Two sets because the card is white in light mode and near-black in dark — one ramp would either
// wash out on white or vanish on dark. Light uses Tailwind -700 shades, dark uses -400.
const RAMP_LIGHT = ['#5b21b6', '#1d4ed8', '#0e7490', '#0f766e', '#15803d', '#4d7c0f', '#a16207'];
const RAMP_DARK = ['#a78bfa', '#60a5fa', '#22d3ee', '#2dd4bf', '#4ade80', '#a3e635', '#facc15'];
const HOURLY_WINDOW_H = 48;
const DAYS = 7;

// Row keys are prefixed so a numeric product id never reaches recharts as a bare numeric dataKey.
const keyFor = (id: string) => `p${id}`;
const pad = (n: number) => String(n).padStart(2, '0');

function dayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}
function hourLabel(date: string, hour: number, minute = 0) {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00Z`).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function slotTime(date: string, hour: number, minute = 0) {
  return Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`);
}

// A few evenly-spaced, rounded rank ticks between lo and hi (needed when we take manual control of
// the Y axis to append the "over 500" sentinel tick).
function axisTicks(lo: number, hi: number): number[] {
  if (hi <= lo) return [Math.round(lo)];
  const n = 4;
  const step = (hi - lo) / (n - 1);
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round(lo + step * i)))];
}

type Row = { t: number; label: string } & Record<string, number | string>;

export default function CreatorRankGraph({
  packsByCountry,
  history,
  defaultCountry,
  rankedByCountry,
}: Props) {
  const [country, setCountry] = useState(defaultCountry);
  const [freq, setFreq] = useState<'daily' | 'hourly'>('daily');
  const chart = useChartColors();
  const isDark = useTheme() === 'dark';

  // Countries this creator charts in, in the site's standard JP > TH > TW order so the strip is
  // stable across creators and matches the rank table's column order. Driven by which markets have
  // packs to plot (not by raw history rows), so a market whose packs all dropped out isn't offered.
  const available = Object.keys(packsByCountry)
    .filter((cc) => (packsByCountry[cc]?.length ?? 0) > 0)
    .sort((a, b) => (COUNTRY_ORDER[a] ?? 99) - (COUNTRY_ORDER[b] ?? 99));
  // Guard against a stale/absent selection without needing an effect.
  const active = available.includes(country) ? country : available[0];
  const packs = (active && packsByCountry[active]) || [];

  const uniqueDates = new Set(history.map((d) => d.snapshot_date)).size;
  const uniqueSlots = new Set(history.map((d) => `${d.snapshot_date}-${d.snapshot_hour}`)).size;
  const hasHourly = uniqueSlots > uniqueDates;
  const mode: 'daily' | 'hourly' = freq === 'hourly' && hasHourly ? 'hourly' : 'daily';

  // The x domain comes from ALL countries' snapshot times, not just the selected one — every
  // country is scraped in the same run, so this is the snapshot calendar. A pack missing at one of
  // these times was outside that country's top 500, which we draw in the "Over #500" band rather
  // than silently bridging over with connectNulls.
  const domain: { key: string; t: number; label: string }[] = [];
  const seriesByPack = new Map<string, Map<string, number>>();
  const inCountry = history.filter((d) => d.country === active);

  if (mode === 'daily') {
    for (const date of [...new Set(history.map((d) => d.snapshot_date))].sort((a, b) => a.localeCompare(b))) {
      domain.push({ key: date, t: Date.parse(`${date}T12:00:00Z`), label: dayLabel(date) });
    }
    for (const p of packs) {
      // Best (lowest) rank per day for this pack in the selected country.
      const byDay = new Map<string, number>();
      for (const d of inCountry) {
        if (d.product_id !== p.id) continue;
        const cur = byDay.get(d.snapshot_date);
        if (cur == null || d.rank < cur) byDay.set(d.snapshot_date, d.rank);
      }
      seriesByPack.set(p.id, byDay);
    }
  } else {
    // Read-only "last 48h" cutoff for display; a little drift across re-renders is harmless.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - HOURLY_WINDOW_H * 3_600_000;
    const keyOf = (d: CreatorGraphPoint) => `${d.snapshot_date}#${d.snapshot_hour}`;
    const inWin = history.filter((d) => slotTime(d.snapshot_date, d.snapshot_hour, d.snapshot_minute) >= cutoff);
    const slots = [...new Map(inWin.map((d) => [keyOf(d), d])).values()].sort(
      (a, b) =>
        slotTime(a.snapshot_date, a.snapshot_hour, a.snapshot_minute) -
        slotTime(b.snapshot_date, b.snapshot_hour, b.snapshot_minute)
    );
    for (const d of slots) {
      domain.push({
        key: keyOf(d),
        t: slotTime(d.snapshot_date, d.snapshot_hour, d.snapshot_minute),
        label: hourLabel(d.snapshot_date, d.snapshot_hour, d.snapshot_minute),
      });
    }
    for (const p of packs) {
      const m = new Map<string, number>();
      for (const d of inWin) if (d.product_id === p.id && d.country === active) m.set(keyOf(d), d.rank);
      seriesByPack.set(p.id, m);
    }
  }

  // Only plot packs that actually charted in this country during the window.
  const shown = packs.filter((p) => (seriesByPack.get(p.id)?.size ?? 0) > 0);
  // `packs` arrives sorted best-rank-first, and `shown` preserves that, so a line's index IS its
  // rank position. Spread the ramp across however many lines are actually drawn rather than taking
  // the first N entries: with two lines that yields the two ends (violet + gold, maximally
  // distinct) instead of two adjacent shades of violet.
  const ramp = isDark ? RAMP_DARK : RAMP_LIGHT;
  const colorOf = (id: string) => {
    const i = shown.findIndex((p) => p.id === id);
    if (i < 0) return ramp[0];
    const t = shown.length <= 1 ? 0 : i / (shown.length - 1);
    return ramp[Math.round(t * (ramp.length - 1))];
  };

  // Drop x slots where the ACTIVE country has no data for ANY pack. The domain is built from every
  // country's snapshot times, but a country can be missing a run (the scraper continues past a
  // failed country, and ONLY= can scrape a subset). Without this, one such slot reads as "all of
  // this creator's packs left the top 500 at 14:00", drawing simultaneous cliffs that never
  // happened. If at least one pack charted at a slot, the country WAS scraped, so the other packs'
  // absences there are genuine drop-outs.
  const slotsWithData = new Set<string>();
  for (const p of shown) for (const k of seriesByPack.get(p.id)!.keys()) slotsWithData.add(k);
  const activeDomain = domain.filter((d) => slotsWithData.has(d.key));

  // Each pack's own observed span. Cells BEFORE a pack's first appearance are left unset rather
  // than sentinel-filled: unlike the sticker chart (where every series is the same pack in a
  // different country, so it demonstrably existed all window), these series are DIFFERENT packs
  // with different release dates. A pack released 2 days ago has no rows for days 1-5, and marking
  // those "Over #500" would assert it fell out of a chart it had never entered. Interior gaps stay
  // sentinel-filled — that is a real drop-out, and connectNulls would otherwise bridge over it.
  const firstIdx = new Map<string, number>();
  for (const p of shown) {
    const m = seriesByPack.get(p.id)!;
    firstIdx.set(p.id, activeDomain.findIndex((d) => typeof m.get(d.key) === 'number'));
  }

  const realRanks: number[] = [];
  for (const { key } of activeDomain) {
    for (const p of shown) {
      const r = seriesByPack.get(p.id)?.get(key);
      if (typeof r === 'number') realRanks.push(r);
    }
  }
  const minRank = realRanks.length ? Math.min(...realRanks) : 1;
  const maxRank = realRanks.length ? Math.max(...realRanks) : 50;

  // Does any plotted pack drop out of the top 500 somewhere in the window? Only gaps at or after a
  // pack's first appearance count, so a brand-new release doesn't switch the red band on.
  const hasOverflow = activeDomain.some((d, i) =>
    shown.some((p) => {
      const first = firstIdx.get(p.id) ?? -1;
      return first >= 0 && i > first && seriesByPack.get(p.id)?.get(d.key) == null;
    })
  );
  // Sit the sentinel just below the worst real rank so an occasional drop-out doesn't squash the
  // real range of the well-performing packs.
  const overLevel = Math.round(maxRank + Math.max(8, (maxRank - minRank) * 0.25));
  const zoneTop = Math.round(maxRank + Math.max(4, (overLevel - maxRank) * 0.35));

  const chartRows: Row[] = activeDomain.map(({ t, label, key }, i) => {
    const row: Row = { t, label };
    for (const p of shown) {
      const r = seriesByPack.get(p.id)?.get(key);
      if (typeof r === 'number') row[keyFor(p.id)] = r;
      else if (i > (firstIdx.get(p.id) ?? -1) && (firstIdx.get(p.id) ?? -1) >= 0) row[keyFor(p.id)] = overLevel;
      // else: before this pack's first appearance — leave unset so the line simply starts later.
    }
    return row;
  });

  const yDomain: [number, number] = [
    Math.max(1, minRank - 2),
    hasOverflow ? overLevel + Math.max(3, Math.round((overLevel - maxRank) * 0.3)) : maxRank + 2,
  ];
  const yTicks = hasOverflow ? [...axisTicks(minRank, maxRank), overLevel] : undefined;
  const info = COUNTRY_MAP[active];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
          <span className="text-2xl">{info?.flag ?? '🌏'}</span>
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">
              {info?.name ?? active?.toUpperCase() ?? '—'}
            </p>
            {/* Count the lines actually drawn, not the server-side cap: `shown` changes with the
                selected country and the Daily/Hourly window, so quoting `packs.length` would
                over-claim (e.g. "top 8" while only 6 packs charted in this country). */}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {mode === 'daily' ? `Last ${DAYS} days` : `Last ${HOURLY_WINDOW_H}h · hourly`}
              {(rankedByCountry[active] ?? 0) > shown.length &&
                ` · showing ${shown.length} of ${rankedByCountry[active]} ranked packs`}
            </p>
          </div>
        </div>

        {/* Country picker — in-memory filter, no extra DB reads */}
        {available.length > 1 && (
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {available.map((cc) => (
              <button
                key={cc}
                onClick={() => setCountry(cc)}
                aria-pressed={cc === active}
                title={COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}
                className={`px-2.5 py-1 transition-colors ${
                  cc === active
                    ? 'bg-green-500 text-white'
                    : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {cc.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Daily / Hourly toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
          <button
            onClick={() => setFreq('daily')}
            aria-pressed={mode === 'daily'}
            className={`px-2.5 py-1 transition-colors ${
              mode === 'daily'
                ? 'bg-green-500 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setFreq('hourly')}
            disabled={!hasHourly}
            aria-pressed={mode === 'hourly'}
            className={`px-2.5 py-1 transition-colors ${
              mode === 'hourly'
                ? 'bg-green-500 text-white'
                : hasHourly
                  ? 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  : 'bg-white dark:bg-gray-900 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
            title={!hasHourly ? 'No recent hourly data yet' : undefined}
          >
            Hourly
          </button>
        </div>
      </div>

      {/* Legend: which colour is which pack */}
      {shown.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mb-2">
          {shown.map((p) => (
            <a
              key={p.id}
              href={`/sticker/${p.id}`}
              title={p.name}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 max-w-[190px]"
            >
              <span
                className="inline-block w-3 h-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: colorOf(p.id) }}
              />
              <span className="truncate">{p.name}</span>
            </a>
          ))}
        </div>
      )}

      {hasOverflow && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
          A line dropping into the <span className="text-red-400 font-medium">Over&nbsp;#500</span> band means that
          pack fell out of {info?.name ?? 'this country'}&apos;s top 500 (we only track the top 500).
        </p>
      )}

      {shown.length === 0 || chartRows.length === 0 ? (
        <div className="flex items-center justify-center h-44 text-sm text-gray-400 dark:text-gray-500">
          {mode === 'hourly'
            ? 'No hourly snapshots in the last 48h yet.'
            : 'No ranking history for this country yet.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartRows} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: chart.axis }} interval="preserveStartEnd" />
            <YAxis
              reversed
              domain={yDomain}
              ticks={yTicks}
              tick={{ fontSize: 10, fill: chart.axis }}
              tickFormatter={(v) => (hasOverflow && v === overLevel ? 'Over 500' : `#${v}`)}
              width={hasOverflow ? 50 : 34}
            />
            <Tooltip
              // Best rank first. recharts defaults itemSorter to 'name', which listed the packs
              // alphabetically; sorting on the value orders them the way the chart reads (rank
              // ascending), and the "Over #500" sentinel is a large number so drop-outs sink to
              // the bottom where they belong.
              itemSorter="value"
              formatter={(value, name) => [
                hasOverflow && value === overLevel ? 'Over #500' : `#${value}`,
                String(name),
              ]}
              labelStyle={{ fontSize: 11, color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                backgroundColor: chart.tooltipBg,
                border: `1px solid ${chart.tooltipBorder}`,
                color: chart.tooltipText,
              }}
            />
            {hasOverflow && (
              <ReferenceArea
                y1={zoneTop}
                y2={yDomain[1]}
                fill={isDark ? 'rgba(239,68,68,0.14)' : '#fef2f2'}
                fillOpacity={0.7}
                ifOverflow="extendDomain"
                label={{ value: 'Over #500', fontSize: 10, fill: '#ef4444', position: 'insideBottomLeft' }}
              />
            )}
            {shown.map((p) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={keyFor(p.id)}
                name={p.name}
                stroke={colorOf(p.id)}
                strokeWidth={2}
                connectNulls
                dot={{ r: 2, strokeWidth: 0, fill: colorOf(p.id) }}
                activeDot={{ r: 4.5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
