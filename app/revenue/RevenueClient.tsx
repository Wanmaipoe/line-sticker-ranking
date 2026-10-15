'use client';

import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOwnerMap } from '@/hooks/useOwnerMap';
import { useChartColors, useTheme } from '@/lib/theme';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  useXAxisScale,
  useYAxisScale,
  usePlotArea,
  ZIndexLayer,
  DefaultZIndexes,
} from 'recharts';
import {
  parseLineReport,
  splitByOwner,
  allocate,
  combineReports,
  appendOwnerColumn,
  parseOwnerColumn,
  periodKey,
  periodLabel,
  ReportFormatError,
  UNASSIGNED,
  type ParsedReport,
} from '@/lib/revenue/report';

/** One uploaded month, keyed by the period it covers so re-uploading a month replaces it. */
interface LoadedMonth {
  key: string;
  label: string;
  fileName: string;
  report: ParsedReport;
  /** The uploaded file's exact text, kept so it can be re-downloaded with an Owner column. */
  rawText: string;
}

const ALL = '__all__';

// v2 = THB per 1 JPY. v1 stored THB per 100 JPY, so reusing the key would silently reread a saved
// "23.15" as 23.15 THB/yen and overstate every THB figure 100x, with nothing to flag it. Bumping
// the key drops the stale value and asks for the rate again — the only safe migration for a number
// whose units changed.
const RATE_KEY = 'lsr-revenue-rate-v2';
// Withholding % used for a month whose file has no payout summary (LINE's "return-*.csv" export).
const TAX_KEY = 'lsr-revenue-tax-v1';
// LINE's rate for a Thai creator, and what every footer-carrying file here has shown. Used for any
// month whose file has no payout summary, unless a rate is typed into the box beside the exchange
// rate. A file that DOES carry a summary always uses LINE's own figures instead.
const DEFAULT_TAX_RATE = 20.42;

/** True when this report cannot say what was withheld: no payout summary and no tax rate. */
function needsTaxRate(r: ParsedReport): boolean {
  return !(r.tiesOut && r.footer.amountPayable != null) && r.footer.withholdingTaxRate == null;
}

// The uploaded CSV is read with FileReader and parsed in this component. It is never POSTed
// anywhere — no fetch, no server action, no DB. Keep it that way: this file holds real payout data.

function money(n: number | null | undefined, currency: string | null) {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString()}${currency ? ` ${currency}` : ''}`;
}

/**
 * The one source of truth for an owner's identity colour: the chip dot, the chart line and the
 * legend all read from this array, so they cannot drift apart. There is no second table of Tailwind
 * classes — the previous one encoded the same hues twice and the two spellings disagreed.
 *
 * No green and no red/pink: the Trending labels colour a rise green and a fall red, so an owner drawn
 * in either reads as a trend rather than a person. Grey is reserved for Unassigned.
 *
 * Checked with the dataviz palette validator (OKLab ΔE×100) over EVERY pair, not just neighbours —
 * every chip is on screen at once, so neighbours are not the only ones compared. The closest two to
 * normal vision are cyan and blue at 19.6. The palette this replaces measured 10.1 (fuchsia vs
 * purple) and put brown and amber in the same table, which is what made the chips hard to tell apart.
 *
 * Known limit: fuchsia vs blue is 7.5 for protanopes, inside the band that needs a second cue. Every
 * chip prints the owner's name beside the dot and every line is named in the legend and the tooltip,
 * so colour is never the only thing carrying identity.
 *
 * FIVE slots, not six. With green, red and grey spoken for there is no sixth hue that stays 15 from
 * all of these: indigo (6.7 vs blue), orange (11.8 vs brown), teal (6.9 vs cyan) and slate (14.3 vs
 * brown, and too grey to read as a colour at all) were each measured and each dragged the worst pair
 * under the floor. A sixth owner reuses the first colour; the name beside the dot is what separates
 * them. Add a sixth hue only with a validator run that still passes.
 *
 * The dark steps are CHOSEN, not the light ones reused: measured against the dark surface, the light
 * brown and blue land at 2.5 and 2.6 against the 3:1 a mark needs, so both were lifted a step and
 * amber and cyan brightened with them. Same five hue families in the same order, so an owner keeps
 * their identity when the theme flips. Dark measures 16.1 on its closest normal-vision pair.
 */
const OWNER_HEX = {
  light: ['#854d0e', '#1d4ed8', '#d946ef', '#d97706', '#0891b2'],
  dark: ['#a16207', '#3b82f6', '#d946ef', '#f59e0b', '#06b6d4'],
};

/**
 * Unassigned is deliberately colourless. Grey reads as "not done yet", and the chip draws a hollow
 * dashed ring instead of a filled dot, so it differs from an owner in SHAPE and not only in hue —
 * it sits 14.3 from cyan, under the 15 the validator wants between two identities, which is fine
 * for a marker that means "no identity yet" and is always labelled.
 */
const UNASSIGNED_HEX = '#9ca3af';

/** The dot that carries an owner's identity. Hollow and dashed when there is no owner yet. */
function OwnerDot({ hex, hollow = false }: { hex: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={hollow ? { border: `1.5px dashed ${hex}` } : { backgroundColor: hex }}
    />
  );
}

/**
 * Owner chip: neutral surface, ink text, coloured dot. The text deliberately does NOT wear the
 * owner's hue — tinted chips (bg-yellow-50 against bg-amber-50) differ by about two values of red
 * and read as the same object, which is exactly the complaint this replaces. The dot is the only
 * thing that carries colour, so chip separation is whatever the validated palette separation is.
 */
function OwnerChip({ name, hex, unassigned = false }: { name: string; hex: string; unassigned?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
        unassigned
          ? 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'
      }`}
    >
      <OwnerDot hex={hex} hollow={unassigned} />
      {name}
    </span>
  );
}

// The chart's everyone-added-up series. Its dataKey is one no owner name can collide with (owner
// names are typed by people); it is labelled "Total". Neutral ink, not a hue, so it never reads as
// another owner.
const TOTAL = '__total__';
const TOTAL_HEX = { light: '#374151', dark: '#e5e7eb' };

/** Month-over-month change in percent, or null when the earlier month has nothing to compare to. */
function pctChange(prev: number, cur: number): number | null {
  if (!(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

/** "▲ 12.3%", "▼ 4.5%", "0%". One decimal under 10%, whole numbers from there up. */
function formatChange(p: number): string {
  const abs = Math.abs(p);
  const shown = abs < 10 ? abs.toFixed(1) : Math.round(abs).toLocaleString();
  if (Number(shown.replace(/,/g, '')) === 0) return '0%';
  return `${p > 0 ? '▲' : '▼'} ${shown}%`;
}

type ChartRow = Record<string, string | number>;

/** Row field: calendar months since the previous loaded month (1 unless a month was never uploaded). */
const SPAN = '__span';

/** "2026.06" -> a month count, or null for a report whose period could not be read. */
function monthIndex(key: string): number | null {
  const [y, m] = key.split('.').map(Number);
  return Number.isFinite(y) && Number.isFinite(m) ? y * 12 + m : null;
}

/** " (2 mo)" when a change spans a month that was never uploaded, so it isn't read as month-over-month. */
function spanSuffix(span: number, tight = false): string {
  return span > 1 ? (tight ? `·${span}mo` : ` (${span} mo)`) : '';
}

/** Chip amounts: 3 significant figures (10,600 -> "10.6k", 219,000 -> "219k", 549 -> "549"). */
function chipAmount(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${Number((v / 1_000_000).toPrecision(3))}M`;
  if (a >= 1_000) return `${Number((v / 1_000).toPrecision(3))}k`;
  return Math.round(v).toLocaleString();
}

/**
 * Trending labels: the % change from one month to the next, for every line passed in, each drawn
 * midway between its two points and just above the higher of them, so it sits over the stretch of
 * line it describes. A dot in the line's colour leads each label: with several lines labelled, the
 * dot (not the label's own colour, which says up or down) is what ties a number to its line.
 *
 * Lines that run close together would stack their labels on top of each other, so the labels in
 * each gap between two months are spread vertically to at least one label height apart: pushed down
 * where they collide, then, if that runs the lowest past the bottom of the plot, pushed back up from
 * the bottom - moving only labels that actually collide, so labels nothing crowds stay on their line.
 * No label is lifted above the top of the SVG (it would be clipped).
 *
 * With many months on a narrow screen, labels in neighbouring gaps would overlap sideways, so only
 * every Nth gap is labelled then, counted back from the latest (which is always labelled). The
 * tooltip still shows every line's change for every month.
 *
 * Rendered as a child of <LineChart>. Recharts 3 draws custom children inside the chart's SVG, and
 * useXAxisScale / useYAxisScale turn a month and an amount into the same pixels the lines use.
 * Recharts 3 also paints by z-index layer, not by child order: a plain child lands UNDER the lines
 * (400) and their dots (600), so another owner's line would run across a label. The labels get
 * their own layer just above the dots, and stay below the hover cursor and highlighted dot.
 */
// Vertical space one label needs (its line-colour dot is the tallest glyph), normal and tight.
const LABEL_GAP = { normal: 17, tight: 14 };
// Lowest baseline that keeps a label's glyphs inside the SVG.
const LABEL_TOP = 13;
// Rough rendered width of a label: per character of text, plus the leading dot and a little air.
const labelWidth = (text: string, tight: boolean) => text.length * (tight ? 6 : 6.6) + (tight ? 9 : 14) + 6;

function ChangeLabels({
  data,
  series,
  dark,
}: {
  data: ChartRow[];
  series: { key: string; color: string }[];
  dark: boolean;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot) return null;
  const up = dark ? '#4ade80' : '#16a34a';
  const down = dark ? '#f87171' : '#dc2626';
  const flat = '#9ca3af';
  // A halo in the card's own background colour (bg-white / dark:bg-gray-900) keeps a label legible
  // where it crosses a gridline or a line.
  const halo = dark ? '#111827' : '#ffffff';
  const bottom = plot.y + plot.height - 2;

  const columns = data.slice(1).map((row, i) => {
    const before = data[i];
    const x0 = xScale(before.month, { position: 'middle' });
    const x1 = xScale(row.month, { position: 'middle' });
    if (x0 == null || x1 == null) return null;
    // On a phone, or with many months loaded, neighbouring gaps are under ~75px wide and
    // "▲ 8.2%" nearly touches "▼ 7.9%". Drop the spaces and a point of size there.
    const tight = x1 - x0 < 75;
    const suffix = spanSuffix(Number(row[SPAN] ?? 1), tight);
    const column = series.flatMap(({ key, color }) => {
      const prev = Number(before[key] ?? 0);
      const cur = Number(row[key] ?? 0);
      const p = pctChange(prev, cur);
      const y0 = yScale(prev);
      const y1 = yScale(cur);
      if (p === null || y0 == null || y1 == null) return [];
      const text = formatChange(p);
      return [{ key, color, text: (tight ? text.replace(' ', '') : text) + suffix, p, y: Math.min(y0, y1) - 9 }];
    });
    column.sort((a, b) => a.y - b.y);
    const gap = tight ? LABEL_GAP.tight : LABEL_GAP.normal;
    for (let j = 1; j < column.length; j++) column[j].y = Math.max(column[j].y, column[j - 1].y + gap);
    const last = column.length - 1;
    if (last >= 0) {
      column[last].y = Math.min(column[last].y, bottom);
      for (let j = last - 1; j >= 0; j--) column[j].y = Math.min(column[j].y, column[j + 1].y - gap);
      // A column too crowded for the plot's height would otherwise lift its top label out of the SVG.
      for (let j = 0; j <= last; j++) column[j].y = Math.max(column[j].y, j ? column[j - 1].y + gap : LABEL_TOP);
    }
    return { month: String(row.month), x: (x0 + x1) / 2, width: x1 - x0, tight, column };
  });

  // Thin out gaps too narrow for their widest label, keeping the latest gap.
  const present = columns.filter((c) => c !== null);
  const widest = Math.max(0, ...present.flatMap((c) => c.column.map((l) => labelWidth(l.text, c.tight))));
  const narrowest = Math.min(...present.map((c) => c.width));
  const every = present.length && narrowest < widest ? Math.ceil(widest / narrowest) : 1;
  const lastGap = columns.length - 1;
  const labels = columns.flatMap((c, i) =>
    c && (lastGap - i) % every === 0
      ? c.column.map((l) => ({ ...l, id: `${c.month}-${l.key}`, x: c.x, tight: c.tight }))
      : []
  );

  return (
    <ZIndexLayer zIndex={DefaultZIndexes.scatter + 50}>
      <g pointerEvents="none">
        {labels.map((l) => (
          <text
            key={l.id}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fontSize={l.tight ? 10 : 11}
            fontWeight={600}
            stroke={halo}
            strokeWidth={4}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            <tspan fill={l.color} fontSize={l.tight ? 11 : 13}>
              {l.tight ? '●' : '● '}
            </tspan>
            <tspan fill={l.text === '0%' ? flat : l.p > 0 ? up : down}>{l.text}</tspan>
          </text>
        ))}
      </g>
    </ZIndexLayer>
  );
}

/** 528925 -> "529k", so the Y axis doesn't need six digits per tick. */
function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

export default function RevenueClient() {
  const router = useRouter();
  const {
    owners,
    map: ownerMapRaw,
    loaded,
    ownerOf,
    assign,
    assignMany,
    importOwners,
    addOwner,
    removeOwner,
    clearAll,
  } = useOwnerMap();
  /** How many packs currently have an owner — shown on the empty state so a restore is visible
   *  before any report is loaded. */
  const ownerCount = Object.keys(ownerMapRaw).length;
  const chart = useChartColors();
  const dark = useTheme() === 'dark';

  const [months, setMonths] = useState<LoadedMonth[]>([]);
  // Trending: label every month-over-month % change on the income chart, on every line. Clicking a
  // name (legend or summary chip) narrows the labels to that one line; clicking it again widens back.
  const [trending, setTrending] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  // The assign list opens on the packs that still need an owner, because that is the only
  // reason to open it. With a few hundred packs the unassigned ones are scattered through the
  // list and finding them meant scrolling the whole thing.
  const [assignFilter, setAssignFilter] = useState<'todo' | 'all'>('todo');
  const [copied, setCopied] = useState(false);
  // THB per 1 JPY (e.g. 0.2315). Thai FX boards quote yen per 100, so divide theirs by 100.
  const [rate, setRate] = useState('');
  // Withholding %, only used for months whose file has no payout summary.
  const [tax, setTax] = useState('');
  // Owners whose pack breakdown is expanded. Keyed by owner name, so a row stays open while you
  // reassign packs around it.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const ownerFileRef = useRef<HTMLInputElement>(null);
  const [ownerImportMsg, setOwnerImportMsg] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setRate(localStorage.getItem(RATE_KEY) ?? ''); } catch {}
    try { setTax(localStorage.getItem(TAX_KEY) ?? ''); } catch {}
  }, []);

  function updateRate(v: string) {
    setRate(v);
    try { localStorage.setItem(RATE_KEY, v); } catch {}
  }

  function updateTax(v: string) {
    setTax(v);
    try { localStorage.setItem(TAX_KEY, v); } catch {}
  }

  const rateNum = Number(rate);
  const rateOk = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum > 0;

  // Months whose file carries no payout summary, and the rate they are taxed at: DEFAULT_TAX_RATE
  // unless a valid rate is typed in. A rate stated by another month is shown as a hint but never
  // applied on its own — a month is only assumed to match LINE's standard rate, not its neighbours'.
  const monthsNeedingTax = months.filter((m) => needsTaxRate(m.report));
  const statedTaxRate = months.map((m) => m.report.footer.withholdingTaxRate).find((r) => r != null) ?? null;
  const typedTax = Number(tax);
  const taxIsTyped = tax.trim() !== '' && Number.isFinite(typedTax) && typedTax >= 0 && typedTax < 100;
  const taxNum = taxIsTyped ? typedTax : DEFAULT_TAX_RATE;

  const toggleOwner = useCallback((owner: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(owner)) next.add(owner);
      return next;
    });
  }, []);

  /** The owner's colour, for both their chip dot and their chart line, so the two always agree. */
  const hexOf = useCallback(
    (name: string) => {
      if (name === UNASSIGNED) return UNASSIGNED_HEX;
      const i = owners.indexOf(name);
      const ramp = dark ? OWNER_HEX.dark : OWNER_HEX.light;
      return i < 0 ? UNASSIGNED_HEX : ramp[i % ramp.length];
    },
    [owners, dark]
  );

  /**
   * Load one or more monthly reports. A file that fails to parse is reported by name and skipped
   * rather than throwing away the months that did load — dropping five good files because the
   * sixth was the wrong CSV would be maddening.
   */
  const loadFiles = useCallback(async (files: File[]) => {
    setError(null);
    setCopied(false);
    const parsed: LoadedMonth[] = [];
    const failed: string[] = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const report = parseLineReport(text);
        const key = periodKey(report);
        parsed.push({ key, label: periodLabel(key), fileName: file.name, report, rawText: text });
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof ReportFormatError ? e.message : 'unreadable'}`);
      }
    }

    if (parsed.length) {
      setMonths((prev) => {
        const byKey = new Map(prev.map((m) => [m.key, m]));
        for (const m of parsed) byKey.set(m.key, m); // re-uploading a month replaces it
        return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
      });
    }
    if (failed.length) setError(`Skipped ${failed.length} file(s) — ${failed.join('; ')}`);
  }, []);

  const removeMonth = useCallback((key: string) => {
    setMonths((prev) => prev.filter((m) => m.key !== key));
    setSelected((s) => (s === key ? ALL : s));
  }, []);

  // What the table renders: one month, or every month folded together.
  const report = useMemo(() => {
    if (!months.length) return null;
    if (selected !== ALL) return months.find((m) => m.key === selected)?.report ?? null;
    return combineReports(months.map((m) => m.report));
  }, [months, selected]);

  // Each month split on its own — the chart's series, and the source of after-tax for the combined
  // view below. Kept separate from `split` because the combined view loses the month axis.
  const monthlySplits = useMemo(() => {
    if (!loaded || months.length < 2) return null;
    return months.map((m) => ({
      key: m.key,
      label: m.label,
      split: splitByOwner(m.report.items, ownerOf, m.report, taxNum),
    }));
  }, [months, loaded, ownerOf, taxNum]);

  const split = useMemo(() => {
    if (!report || !loaded) return null;
    const base = splitByOwner(report.items, ownerOf, report, taxNum);
    if (selected !== ALL || !monthlySplits) return base;
    // Viewing every month at once: each month was settled under its OWN rule — its payout summary
    // if the file carries one, otherwise the assumed rate — so after-tax is the sum of the months,
    // never one rate applied to the pile. Combining first and taxing after let a month that states
    // a rate tax the months that do not (a 15% June taxed August's revenue at 15% too). Items,
    // counts, pre-tax and the pack lists still come from the combined report.
    const perOwner = new Map<string, number | null>();
    for (const m of monthlySplits) {
      for (const sh of m.split.shares) {
        const seen = perOwner.get(sh.owner);
        // One month with no after-tax figure (no summary, no rate) makes the owner's total unknown.
        perOwner.set(sh.owner, sh.afterTax == null || seen === null ? null : (seen ?? 0) + sh.afterTax);
      }
    }
    return {
      ...base,
      shares: base.shares.map((sh) => (perOwner.has(sh.owner) ? { ...sh, afterTax: perOwner.get(sh.owner)! } : sh)),
      exact: monthlySplits.every((m) => m.split.exact),
      taxAssumed: monthlySplits.some((m) => m.split.taxAssumed),
    };
  }, [report, loaded, ownerOf, taxNum, selected, monthlySplits]);

  /** Owners appearing in any loaded month, ordered by total earnings so the legend leads with the biggest. */
  const chartOwners = useMemo(() => {
    if (!monthlySplits) return [];
    const totals = new Map<string, number>();
    for (const m of monthlySplits) {
      for (const s of m.split.shares) {
        totals.set(s.owner, (totals.get(s.owner) ?? 0) + (s.afterTax ?? 0));
      }
    }
    return [...totals.entries()]
      .sort((a, b) => {
        if (a[0] === UNASSIGNED) return 1;
        if (b[0] === UNASSIGNED) return -1;
        return b[1] - a[1];
      })
      .map(([o]) => o);
  }, [monthlySplits]);

  // A Total line only adds something when there is more than one owner to add up.
  const showTotal = chartOwners.length > 1;

  const chartData = useMemo(() => {
    if (!monthlySplits) return null;
    return monthlySplits.map((m, i) => {
      const row: ChartRow = { month: m.label };
      // Months since the previous LOADED month. If a month was never uploaded, a "change from the
      // previous month" really spans two, and the labels and tooltip say so. Unknown periods count as 1.
      const here = monthIndex(m.key);
      const prev = i > 0 ? monthIndex(monthlySplits[i - 1].key) : null;
      row[SPAN] = here !== null && prev !== null && here - prev > 1 ? here - prev : 1;
      // 0, not undefined: an owner with no packs that month genuinely earned nothing, and a gap
      // in the line would read as "no data" instead.
      for (const o of chartOwners) row[o] = 0;
      // THB when a rate is set (what the team actually pays out in); JPY otherwise. A constant
      // rate scales every point identically, so the trend shape is the same either way.
      for (const s of m.split.shares) {
        const jpy = s.afterTax ?? 0;
        row[s.owner] = rateOk ? Math.round(jpy * rateNum) : jpy;
      }
      // Everyone, Unassigned included. Summed from the plotted (already rounded) values rather
      // than converted from the JPY total, so the owners in a month's tooltip add up to it exactly.
      if (chartOwners.length > 1) row[TOTAL] = chartOwners.reduce((sum, o) => sum + Number(row[o]), 0);
      return row;
    });
  }, [monthlySplits, chartOwners, rateOk, rateNum]);

  // Every line on the chart, in legend order: Total, then owners by total earnings, Unassigned last.
  const seriesKeys = useMemo(() => (showTotal ? [TOTAL, ...chartOwners] : chartOwners), [showTotal, chartOwners]);
  const seriesColor = (key: string) => (key === TOTAL ? (dark ? TOTAL_HEX.dark : TOTAL_HEX.light) : hexOf(key));
  const seriesName = (key: string) => (key === TOTAL ? 'Total' : key === UNASSIGNED ? 'Unassigned' : key);
  // The narrowed-to line, if it is still on the chart (reassigning packs can remove an owner's line).
  const focused = focusKey !== null && seriesKeys.includes(focusKey) ? focusKey : null;
  const toggleFocus = (key: string) => setFocusKey((k) => (k === key ? null : key));

  const chartCurrency = rateOk ? 'THB' : 'JPY';

  // What the two money tiles show. Taken from the split, not straight from the footer, because the
  // footer only describes the months that HAVE one: viewing all months with one footer-less file
  // among them summed a payout for the other months only, and the tile contradicted the table's
  // total right below it. The split always covers every row on screen.
  const payableShown = (() => {
    const fromSplit =
      split && split.shares.length && split.shares.every((s) => s.afterTax != null)
        ? split.shares.reduce((a, s) => a + (s.afterTax ?? 0), 0)
        : null;
    return fromSplit ?? report?.footer.amountPayable ?? null;
  })();
  const withheldShown =
    report && payableShown != null ? report.rowTotal - payableShown : (report?.footer.withholdingTaxAmount ?? null);
  const effectiveTaxRate =
    report && withheldShown != null && report.rowTotal > 0
      ? Math.round((withheldShown / report.rowTotal) * 10000) / 100
      : null;

  // Per-owner THB, converted from the JPY each owner is owed. Worked in satang (integer) and
  // allocated with the same largest-remainder pass as the JPY column, so the THB parts add up to
  // the THB total exactly instead of drifting a few satang apart from rounding each row alone.
  const thbParts = useMemo(() => {
    if (!split || !rateOk) return null;
    const totalJpy = split.shares.reduce((a, s) => a + (s.afterTax ?? 0), 0);
    if (!totalJpy || split.shares.every((s) => s.afterTax == null)) return null;
    const totalSatang = Math.round(totalJpy * rateNum * 100);
    return allocate(totalSatang, split.shares.map((s) => s.afterTax ?? 0));
  }, [split, rateOk, rateNum]);

  // Each owner's after-tax money, split again across their own packs by pre-tax weight, using the
  // same largest-remainder pass. Lets the expanded rows fill every column of the parent table and
  // still add up to the owner's row exactly, so the breakdown nests instead of merely sitting near.
  const packBreakdown = useMemo(() => {
    if (!split) return null;
    return split.shares.map((s, i) => {
      const weights = s.packs.map((p) => p.revenue);
      return {
        jpy: s.afterTax != null ? allocate(s.afterTax, weights) : null,
        thb: thbParts?.[i] != null ? allocate(thbParts[i], weights) : null,
      };
    });
  }, [split, thbParts]);

  const thb = (satang: number | undefined) =>
    satang == null
      ? '—'
      : (satang / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currency = report?.currency ?? null;
  const unassignedIds = useMemo(
    () => (report ? report.items.filter((i) => !ownerOf(i.itemId)).map((i) => i.itemId) : []),
    [report, ownerOf]
  );

  function buildExport(): string {
    if (!report || !split) return '';
    const rows: string[][] = [
      ['Period', `${report.period?.from ?? ''} - ${report.period?.to ?? ''}`],
      ['Creator ID', report.footer.creatorId ?? ''],
      ['Currency', currency ?? ''],
      ['Total revenue share', String(report.rowTotal)],
      ['Withholding tax rate', report.footer.withholdingTaxRate != null ? `${report.footer.withholdingTaxRate}%` : ''],
      ['Amount payable', String(report.footer.amountPayable ?? '')],
      ['Exchange rate used', rateOk ? `1 JPY = ${rateNum} THB` : 'not set'],
      [],
      [
        'Owner',
        'Packs',
        'Sale Count',
        'Revenue share pre-tax (JPY)',
        'Share %',
        'After tax (JPY)',
        'After tax (THB)',
      ],
      ...split.shares.map((s, i) => [
        s.owner === UNASSIGNED ? 'UNASSIGNED' : s.owner,
        String(s.items),
        String(s.counts),
        String(s.pretax),
        s.pct.toFixed(2),
        s.afterTax != null ? String(s.afterTax) : '',
        thbParts?.[i] != null ? (thbParts[i] / 100).toFixed(2) : '',
      ]),
    ];
    // Quote anything containing a comma/quote so the export re-imports cleanly into Sheets/Excel.
    return rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n');
  }

  function saveCsv(csv: string, filename: string) {
    // ﻿ BOM so Excel reads the file as UTF-8 (Thai pack titles / owner names).
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function download() {
    saveCsv(buildExport(), `revenue-split-${report?.period?.from?.replace(/\./g, '') ?? 'export'}.csv`);
  }

  // The counterpart to downloadWithOwners. Owner assignments live only in this browser's
  // localStorage, so a reinstalled OS or a cleared profile loses them and the exported
  // "-with-owners.csv" is the only surviving copy. Reading it back restores the roster and every
  // assignment. Existing assignments always win, so this only fills the gaps.
  async function importOwnersFromFile(file: File) {
    setOwnerImportMsg(null);
    try {
      const text = await file.text();
      const { pairs, owners: names, conflicts } = parseOwnerColumn(text);
      if (!pairs.length) {
        setOwnerImportMsg('No owners found in that file — every row was blank or "Unassigned".');
        return;
      }
      const { added, kept } = importOwners(pairs, names);
      const bits = [`Restored ${added} pack${added === 1 ? '' : 's'} across ${names.length} owners`];
      if (kept) bits.push(`${kept} kept as already assigned here`);
      if (conflicts.length) bits.push(`${conflicts.length} item ID(s) listed twice in the file`);
      setOwnerImportMsg(bits.join(' · '));
    } catch (e) {
      setOwnerImportMsg(
        e instanceof ReportFormatError ? e.message : 'Could not read that file as a CSV.'
      );
    }
  }

  // Re-download the ORIGINAL uploaded file(s), unchanged except for an 'Owner' column appended to
  // every row. One file when a single month is in view; when "All months" is selected, each loaded
  // month is saved as its own file (staggered so the browser doesn't swallow the later ones).
  function downloadWithOwners() {
    const targets = selected === ALL ? months : months.filter((m) => m.key === selected);
    targets.forEach((m, i) => {
      const emit = () => {
        try {
          saveCsv(appendOwnerColumn(m.rawText, ownerOf), `${m.fileName.replace(/\.csv$/i, '')}-with-owners.csv`);
        } catch {
          setError('Could not build the annotated file for ' + m.label + '.');
        }
      };
      if (i === 0) emit();
      else setTimeout(emit, i * 400);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Use Summary CSV instead.');
    }
  }

  async function signOut() {
    await fetch('/api/revenue/session', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline flex-shrink-0">
              ← Rankings
            </Link>
            <span className="text-gray-200 dark:text-gray-700">·</span>
            <h1 className="font-bold text-gray-800 dark:text-gray-100 truncate">🔒 Revenue distribution</h1>
          </div>
          <button onClick={signOut} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Upload */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = Array.from(e.dataTransfer.files ?? []);
            if (f.length) loadFiles(f);
          }}
          className={`bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-[#06c755] bg-green-50/40 dark:bg-green-500/10' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {months.length ? 'Add more months' : 'Upload your LINE revenue reports'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Drag one or more .csv files here, or{' '}
            <button onClick={() => fileRef.current?.click()} className="text-green-600 dark:text-green-400 hover:underline">
              choose files
            </button>
            . They are read in your browser and never uploaded.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              if (f.length) loadFiles(f);
              e.target.value = ''; // let the same file be re-picked after a fix
            }}
          />

          {/* Owner import lives out here, not in the Owners card: that card only renders once a
              report is loaded, and restoring owners is the first thing you want to do after losing
              a browser profile — before there is anything to attach them to. */}
          <input
            ref={ownerFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importOwnersFromFile(f);
              e.target.value = ''; // let the same file be re-picked
            }}
          />

          {!months.length && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {ownerCount > 0
                  ? `${ownerCount} pack${ownerCount === 1 ? '' : 's'} already assigned across ${owners.length} owner${owners.length === 1 ? '' : 's'} in this browser.`
                  : 'Lost your owner assignments? Restore them from a CSV you exported with "Download with owners".'}
              </p>
              <button
                onClick={() => ownerFileRef.current?.click()}
                className="mt-2 text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
              >
                ↥ Import owners
              </button>
              {ownerImportMsg && (
                <p className="text-xs mt-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 inline-block">
                  {ownerImportMsg}
                </p>
              )}
            </div>
          )}

          {months.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
              {months.map((m) => (
                <span
                  key={m.key}
                  title={m.fileName}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                >
                  {m.label}
                  <button
                    onClick={() => removeMonth(m.key)}
                    className="w-4 h-4 rounded-full hover:bg-black/10 dark:hover:bg-white/10 leading-none text-gray-400 dark:text-gray-500"
                    title={`Remove ${m.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-xl px-3 py-2.5 mt-3 text-left">
              {error}
            </p>
          )}
        </section>

        {/* Month selector — only earns its space once there's more than one month. */}
        {months.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Showing</span>
            {[{ key: ALL, label: `All ${months.length} months` }, ...months].map((m) => (
              <button
                key={m.key}
                onClick={() => setSelected(m.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selected === m.key
                    ? 'bg-[#06c755] text-white border-[#06c755]'
                    : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {report && split && (
          <>
            {/* Report header */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700 dark:text-gray-200">Report summary</h2>
                {report.period && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {report.period.from} – {report.period.to}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Packs sold</p>
                  <p className="text-lg font-bold text-gray-700 dark:text-gray-200 leading-tight">{report.items.length}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Revenue share</p>
                  <p className="text-lg font-bold text-gray-700 dark:text-gray-200 leading-tight">
                    {money(report.rowTotal, currency)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Withholding tax
                    {effectiveTaxRate != null && ` (${effectiveTaxRate}%${split.taxAssumed ? ', assumed' : ''})`}
                  </p>
                  <p className="text-lg font-bold text-red-500 dark:text-red-400 leading-tight">
                    −{money(withheldShown, currency)}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-500/10 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-green-600 dark:text-green-400">
                    Amount payable{split.taxAssumed && ' (assumed)'}
                  </p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300 leading-tight">
                    {money(payableShown, currency)}
                  </p>
                </div>
              </div>

              {report.warnings.map((w) => (
                <p
                  key={w}
                  className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 rounded-xl px-3 py-2.5 mt-3"
                >
                  ⚠ {w}
                </p>
              ))}
            </section>

            {/* Owners roster */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-gray-700 dark:text-gray-200">Owners</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Saved in this browser, so next month&apos;s upload fills itself in — and lost if
                    the browser profile is. Export a copy from &quot;Download with owners&quot;.
                  </p>
                </div>
                {/* Restores the roster from a previously exported "-with-owners.csv". */}
                <button
                  onClick={() => ownerFileRef.current?.click()}
                  title="Restore owners from a CSV you exported with Download with owners"
                  className="flex-shrink-0 text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
                >
                  ↥ Import owners
                </button>
              </div>

              {ownerImportMsg && (
                <p className="text-xs mt-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  {ownerImportMsg}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {owners.map((o) => (
                  <span
                    key={o}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  >
                    <OwnerDot hex={hexOf(o)} />
                    {o}
                    <button
                      onClick={() => removeOwner(o)}
                      className="w-4 h-4 rounded-full hover:bg-black/10 dark:hover:bg-white/10 leading-none"
                      title={`Remove ${o} and unassign their packs`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!owners.length && <span className="text-xs text-gray-400 dark:text-gray-500">No owners yet. Add one below.</span>}
              </div>

              <div className="flex gap-2 mt-3">
                <input
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addOwner(newOwner);
                      setNewOwner('');
                    }
                  }}
                  placeholder="Add an owner name"
                  className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 focus:border-[#06c755] focus:outline-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <button
                  onClick={() => {
                    addOwner(newOwner);
                    setNewOwner('');
                  }}
                  disabled={!newOwner.trim()}
                  className="px-4 py-2 bg-[#06c755] text-white rounded-xl text-xs font-medium hover:bg-[#05b04a] disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              {unassignedIds.length > 0 && owners.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Assign the {unassignedIds.length} remaining to
                  </span>
                  <select
                    value={bulkOwner}
                    onChange={(e) => setBulkOwner(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100"
                  >
                    <option value="">Choose...</option>
                    {owners.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (bulkOwner) assignMany(unassignedIds, bulkOwner);
                    }}
                    disabled={!bulkOwner}
                    className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}
            </section>

            {months.length === 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3">
                Load a second month to get the &ldquo;Income by owner&rdquo; chart — it plots one point per
                month, so it needs at least two.
              </p>
            )}

            {/* Trend — only meaningful with more than one month. THB once a rate is entered
                (that's the money the team splits); JPY until then rather than an empty chart. */}
            {chartData && chartData.length > 1 && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-700 dark:text-gray-200">Income by owner</h2>
                    <button
                      type="button"
                      onClick={() => setTrending((t) => !t)}
                      aria-pressed={trending}
                      title="Show the % change from each month to the next"
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        trending
                          ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      📈 Trending
                    </button>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    After-tax {chartCurrency} per month
                    {!rateOk && ' — enter an exchange rate above to see this in THB'}
                  </span>
                </div>
                {trending && (
                  <div className="mt-3">
                    {/* From the first loaded month to the latest, per line. Same order and colours
                        as the legend; each chip also narrows the chart's labels to that line. */}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Since {String(chartData[0].month)} (to {String(chartData[chartData.length - 1].month)})
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {seriesKeys.map((key) => {
                        const first = Number(chartData[0][key] ?? 0);
                        const last = Number(chartData[chartData.length - 1][key] ?? 0);
                        const p = pctChange(first, last);
                        // No % from a zero start: "new" if it earns something by the end, else a dash.
                        const text = p !== null ? formatChange(p) : last > 0 ? 'new' : '—';
                        // Endpoints that would print identically next to a real % change get exact figures.
                        let from = chipAmount(first);
                        let to = chipAmount(last);
                        if (from === to && p !== null && text !== '0%') {
                          from = Math.round(first).toLocaleString();
                          to = Math.round(last).toLocaleString();
                        }
                        const isFocused = focused === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleFocus(key)}
                            aria-pressed={isFocused}
                            title={isFocused ? 'Show % labels on every line again' : `Show % labels only on ${seriesName(key)}`}
                            className={`inline-flex items-center gap-1.5 text-xs rounded-lg border px-2 py-1 transition-colors ${
                              isFocused
                                ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seriesColor(key) }} />
                            <span className={`text-gray-700 dark:text-gray-200 ${isFocused ? 'font-semibold' : ''}`}>
                              {seriesName(key)}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 tabular-nums">
                              {from} → {to}
                            </span>
                            <span
                              className={`font-semibold tabular-nums ${
                                p === null || text === '0%'
                                  ? 'text-gray-400 dark:text-gray-500'
                                  : p > 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {text}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                      {focused
                        ? `Chart labels: % change from the previous month on ${seriesName(focused)} only. Click it again to show every line.`
                        : 'Chart labels: % change from the previous month on every line. Click a name to show only that line.'}
                    </p>
                  </div>
                )}

                {/* Numeric height, matching RankGraph: ResponsiveContainer with height="100%"
                    measured the wrapper at 8px here and drew nothing. */}
                <div className="mt-4 -ml-2">
                  {/* 360, not 280: with Trending on, every line carries a label per month and the
                      owners earning little run close together near zero, so labels need the room.
                      The same height with Trending off: resizing on toggle replays the line-draw
                      animation. */}
                  <ResponsiveContainer width="100%" height={360}>
                    {/* top: 24 leaves room for a Trending label above the highest point. */}
                    <LineChart data={chartData} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: chart.axis }}
                        axisLine={{ stroke: chart.axisLine }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={compact}
                        tick={{ fontSize: 11, fill: chart.axis }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        // Highest earner for the hovered month on top. Recharts defaults to sorting
                        // by name (alphabetical) — return -value so it ranks by that month's amount.
                        itemSorter={(item) =>
                          -(typeof item.value === 'number' ? item.value : Number(item.value ?? 0))
                        }
                        formatter={(value, name, item) => {
                          // Chart values are already in chartCurrency (THB when a rate is set, JPY
                          // otherwise). Show just that one figure — the header already says which.
                          const v = typeof value === 'number' ? value : Number(value ?? 0);
                          let shown = `${Math.round(v).toLocaleString()} ${chartCurrency}`;
                          // Trending: every line's change from the previous month, not only the
                          // labelled one. The first month has nothing to compare against.
                          if (trending && item?.dataKey != null) {
                            const at = chartData.findIndex((r) => r.month === item.payload?.month);
                            const p = at > 0 ? pctChange(Number(chartData[at - 1][String(item.dataKey)] ?? 0), v) : null;
                            if (p !== null) shown += `  (${formatChange(p)}${spanSuffix(Number(chartData[at][SPAN] ?? 1))})`;
                          }
                          return [shown, String(name) === UNASSIGNED ? 'Unassigned' : String(name)];
                        }}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 12,
                          backgroundColor: chart.tooltipBg,
                          border: `1px solid ${chart.tooltipBorder}`,
                          color: chart.tooltipText,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        }}
                        labelStyle={{ color: chart.tooltipText }}
                        itemStyle={{ color: chart.tooltipText }}
                      />
                      <Legend
                        // Explicit order: Total, then owners by total earnings, Unassigned last.
                        // The default sorts alphabetically, and `null` (no sort) is not the render
                        // order either: it is the order the lines FIRST mounted, so importing owners
                        // after loading reports left the old Unassigned line in front.
                        itemSorter={(item) => seriesKeys.indexOf(String(item.dataKey))}
                        // Trending: a name narrows the % labels to that line (click again: every line).
                        onClick={trending ? (entry) => entry.dataKey != null && toggleFocus(String(entry.dataKey)) : undefined}
                        wrapperStyle={trending ? { cursor: 'pointer' } : undefined}
                        formatter={(v: string, entry) => {
                          const labelled = trending && focused !== null && entry.dataKey === focused;
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                color: labelled ? chart.tooltipText : chart.legend,
                                fontWeight: labelled ? 700 : undefined,
                                textDecoration: labelled ? 'underline' : undefined,
                              }}
                            >
                              {v === UNASSIGNED ? 'Unassigned' : v}
                            </span>
                          );
                        }}
                      />
                      {/* Total first, so it leads the legend. Drawn under the owners' lines. */}
                      {showTotal && (
                        <Line
                          key={TOTAL}
                          type="monotone"
                          dataKey={TOTAL}
                          name="Total"
                          stroke={dark ? TOTAL_HEX.dark : TOTAL_HEX.light}
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 0, fill: dark ? TOTAL_HEX.dark : TOTAL_HEX.light }}
                          activeDot={{ r: 5 }}
                        />
                      )}
                      {chartOwners.map((o) => (
                        <Line
                          key={o}
                          type="monotone"
                          dataKey={o}
                          name={o}
                          stroke={hexOf(o)}
                          strokeWidth={2}
                          strokeDasharray={o === UNASSIGNED ? '4 3' : undefined}
                          dot={{ r: 3, strokeWidth: 0, fill: hexOf(o) }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                      {/* Last, so the labels sit on top of every line. */}
                      {trending && (
                        <ChangeLabels
                          data={chartData}
                          series={(focused ? [focused] : seriesKeys).map((key) => ({ key, color: seriesColor(key) }))}
                          dark={dark}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                  Each line is one owner&apos;s after-tax share for that month, using your current
                  owner assignments applied to every month. Unassigned packs are the dashed line.
                  {showTotal && ' Total is everyone added together, Unassigned included.'}
                  {rateOk &&
                    ` THB is converted at 1 JPY = ${rateNum} for every month, so older months are estimates — each month really settled at its own rate.`}
                </p>
              </section>
            )}

            {/* Result — deliberately ABOVE the per-pack list: it's the answer you came for, and
                the assignment list runs to ~90 rows, so burying the totals under it means
                scrolling past everything to see whether the split moved. */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700 dark:text-gray-200">Revenue sharing</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={copy}
                    title="Copy the owner-split summary to the clipboard"
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={download}
                    title="Download the owner-split summary (totals per owner)"
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Summary CSV
                  </button>
                  <button
                    onClick={downloadWithOwners}
                    title="Download the original LINE file(s) unchanged, with an Owner column added at the end"
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#06c755] text-white hover:bg-[#05b04a]"
                  >
                    {selected === ALL && months.length > 1 ? 'Original files + Owner' : 'Original + Owner'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                <label htmlFor="fx" className="text-xs text-gray-500 dark:text-gray-400">
                  Exchange rate: <span className="font-medium text-gray-700 dark:text-gray-200">1 JPY</span> =
                </label>
                <input
                  id="fx"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0"
                  value={rate}
                  onChange={(e) => updateRate(e.target.value)}
                  placeholder="0.2315"
                  className="w-24 px-2 py-1 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-[#06c755] focus:outline-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">THB</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {rateOk
                    ? months.length > 1
                      ? 'This one rate is applied to every loaded month, so THB for older months is an estimate — each month really settled at its own rate.'
                      : 'Use the rate your bank actually gave you, so the THB column matches the money that landed.'
                    : 'Enter a rate to fill the THB column.'}
                </span>
              </div>

              {/* Only for files with no payout summary — with one, LINE's own figures are used. */}
              {monthsNeedingTax.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <label htmlFor="wht" className="text-xs text-gray-500 dark:text-gray-400">
                    Withholding tax:
                  </label>
                  <input
                    id="wht"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="99"
                    value={tax}
                    onChange={(e) => updateTax(e.target.value)}
                    placeholder={String(taxNum)}
                    className="w-24 px-2 py-1 rounded-lg border-2 border-gray-200 dark:border-gray-700 focus:border-[#06c755] focus:outline-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {monthsNeedingTax.map((m) => m.label).join(', ')}{' '}
                    {monthsNeedingTax.length === 1 ? 'has' : 'have'} no payout summary (LINE&apos;s
                    &ldquo;return&rdquo; export stops at the last data row), so after-tax there uses{' '}
                    {taxIsTyped ? `${taxNum}%` : `${DEFAULT_TAX_RATE}%`}
                    {!taxIsTyped && ' by default'}. Change it here if LINE withheld a different rate.
                    {!taxIsTyped &&
                      statedTaxRate != null &&
                      statedTaxRate !== DEFAULT_TAX_RATE &&
                      ` Your ${months.find((m) => m.report.footer.withholdingTaxRate != null)?.label} file states ${statedTaxRate}%.`}
                  </span>
                </div>
              )}

              {split.unassignedCount > 0 && (
                <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 rounded-xl px-3 py-2.5 mt-3">
                  ⚠ {split.unassignedCount === 1
                    ? '1 pack still has no owner. Its'
                    : `${split.unassignedCount} packs still have no owner. Their`}{' '}
                  revenue is parked in the Unassigned row below.
                </p>
              )}

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left font-medium py-2">Owner</th>
                      <th className="text-right font-medium py-2">Packs</th>
                      <th className="text-right font-medium py-2 hidden sm:table-cell whitespace-nowrap">
                        Sale Count
                      </th>
                      <th className="text-right font-medium py-2">Share</th>
                      <th className="text-right font-medium py-2 whitespace-nowrap">Pre-tax (JPY)</th>
                      <th className="text-right font-medium py-2 whitespace-nowrap">After tax (JPY)</th>
                      <th className="text-right font-medium py-2 whitespace-nowrap">After tax (THB)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {split.shares.map((s, i) => {
                      const isUn = s.owner === UNASSIGNED;
                      const open = expanded.has(s.owner);
                      return (
                        <Fragment key={s.owner}>
                          <tr className={isUn ? 'bg-gray-50/70 dark:bg-gray-800/40' : ''}>
                            <td className="py-2.5">
                              <button
                                onClick={() => toggleOwner(s.owner)}
                                aria-expanded={open}
                                title={open ? 'Hide packs' : 'Show packs, biggest earner first'}
                                className="flex items-center gap-1.5 group"
                              >
                                <span
                                  className={`text-[9px] text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform ${
                                    open ? 'rotate-90' : ''
                                  }`}
                                  aria-hidden
                                >
                                  ▶
                                </span>
                                <OwnerChip
                                  name={isUn ? 'Unassigned' : s.owner}
                                  hex={hexOf(s.owner)}
                                  unassigned={isUn}
                                />
                              </button>
                            </td>
                            <td className="text-right text-gray-500 dark:text-gray-400 text-xs">{s.items}</td>
                            <td className="text-right text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">{s.counts}</td>
                            <td className="text-right text-gray-500 dark:text-gray-400 text-xs">{s.pct.toFixed(1)}%</td>
                            <td className="text-right text-gray-700 dark:text-gray-200">{money(s.pretax, null)}</td>
                            <td className="text-right font-bold text-green-700 dark:text-green-300">{money(s.afterTax, null)}</td>
                            <td className="text-right font-bold text-gray-700 dark:text-gray-200">{thb(thbParts?.[i])}</td>
                          </tr>

                          {/* One real <tr> per pack, so every figure lands under the header it
                              belongs to. Share is a slice of the WHOLE report, matching what the
                              owner row above means by Share — a column has to mean one thing, or
                              the child percentages quietly contradict the parent's. */}
                          {open &&
                            s.packs.map((p, n) => (
                              <tr
                                key={p.itemId}
                                className={`text-xs ${isUn ? 'bg-amber-50/30 dark:bg-amber-500/10' : 'bg-gray-50/60 dark:bg-gray-800/60'}`}
                              >
                                <td className="py-1.5 pl-5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-4 text-right text-[10px] text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">
                                      {n + 1}
                                    </span>
                                    <span className="w-6 h-6 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                      {p.type === 'Sticker' ? (
                                        <Image
                                          src={`https://stickershop.line-scdn.net/stickershop/v1/product/${p.itemId}/LINEStorePC/main.png`}
                                          alt=""
                                          width={24}
                                          height={24}
                                          unoptimized
                                          className="object-contain w-full h-full"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.visibility = 'hidden';
                                          }}
                                        />
                                      ) : (
                                        <span className="text-[8px] text-gray-300 dark:text-gray-600">{p.type.slice(0, 2)}</span>
                                      )}
                                    </span>
                                    <span className="truncate text-gray-600 dark:text-gray-300" title={p.title}>
                                      {p.title}
                                    </span>
                                  </div>
                                </td>
                                {/* Packs: a single pack has no count of its own. */}
                                <td />
                                <td className="text-right text-gray-400 dark:text-gray-500 hidden sm:table-cell">{p.counts}</td>
                                <td className="text-right text-gray-400 dark:text-gray-500">
                                  {report.rowTotal > 0
                                    ? `${((p.revenue / report.rowTotal) * 100).toFixed(1)}%`
                                    : '—'}
                                </td>
                                <td className="text-right text-gray-600 dark:text-gray-300">{money(p.revenue, null)}</td>
                                <td className="text-right text-green-700/80 dark:text-green-300/80">
                                  {money(packBreakdown?.[i]?.jpy?.[n], null)}
                                </td>
                                <td className="text-right text-gray-600 dark:text-gray-300">
                                  {thb(packBreakdown?.[i]?.thb?.[n])}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-100 dark:border-gray-800 font-bold">
                      <td className="py-2.5 text-gray-700 dark:text-gray-200">Total</td>
                      <td className="text-right text-gray-500 dark:text-gray-400 text-xs">{report.items.length}</td>
                      <td className="text-right text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">
                        {split.shares.reduce((a, s) => a + s.counts, 0)}
                      </td>
                      <td className="text-right text-gray-500 dark:text-gray-400 text-xs">100%</td>
                      <td className="text-right text-gray-700 dark:text-gray-200">{money(report.rowTotal, null)}</td>
                      <td className="text-right text-green-700 dark:text-green-300">
                        {/* Every row shows '—' when after-tax is unknown; the total must not
                            contradict them with a confident 0. */}
                        {split.shares.some((s) => s.afterTax != null)
                          ? money(
                              split.shares.reduce((a, s) => a + (s.afterTax ?? 0), 0),
                              null
                            )
                          : '—'}
                      </td>
                      <td className="text-right text-gray-700 dark:text-gray-200">
                        {thbParts ? thb(thbParts.reduce((a, b) => a + b, 0)) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
                LINE pays in JPY.{' '}
                {split.exact
                  ? 'After-tax figures split the report’s Amount Payable and add up to it exactly.'
                  : split.taxAssumed
                    ? `After-tax figures apply ${taxNum}% withholding, because this file has no payout summary to split — set the rate above if LINE withheld a different one.`
                    : 'After-tax figures are estimated by applying the withholding rate, because this file’s rows do not add up to its stated total.'}
                {rateOk &&
                  ` THB is converted at 1 JPY = ${rateNum} THB and also adds up exactly, but it is only as accurate as that rate — your bank’s rate on payout day is the one that decides what actually arrives.`}{' '}
                Expand an owner (▶) to list their packs, biggest earner first; every column there
                adds up to that owner’s row.
              </p>
            </section>

            {/* Assign */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700 dark:text-gray-200">Assign an owner to each pack</h2>
                {/* The count was already where the eye goes, so it is the filter rather than a label
                    beside one. Amber here is a STATUS — work remaining — not an identity; owners are
                    identified by their dot, and grey means nobody owns it yet. */}
                {split.unassignedCount ? (
                  <div className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 p-0.5 text-xs">
                    {([
                      ['todo', `${split.unassignedCount} to assign`],
                      ['all', `All ${report.items.length}`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setAssignFilter(key)}
                        aria-pressed={assignFilter === key}
                        className={`px-2.5 py-1 rounded-full transition-colors ${
                          assignFilter === key
                            ? key === 'todo'
                              ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30">
                    All {report.items.length} assigned
                  </span>
                )}
              </div>

              <div className="mt-4 divide-y divide-gray-50 dark:divide-gray-800">
                {/* Once the last one is assigned there is nothing to filter to, so the list falls
                    back to showing everything on its own rather than emptying out. */}
                {(assignFilter === 'todo' && split.unassignedCount
                  ? report.items.filter((it) => !ownerOf(it.itemId))
                  : report.items
                ).map((it) => {
                  const owner = ownerOf(it.itemId);
                  return (
                    <div key={it.itemId} className="py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center">
                        {it.type === 'Sticker' ? (
                          <Image
                            src={`https://stickershop.line-scdn.net/stickershop/v1/product/${it.itemId}/LINEStorePC/main.png`}
                            alt=""
                            width={40}
                            height={40}
                            unoptimized
                            className="object-contain w-full h-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.visibility = 'hidden';
                            }}
                          />
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">{it.type.slice(0, 2)}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{it.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">ID {it.itemId}</span>
                          {it.byCountry.map((c) => (
                            <span
                              key={c.country}
                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded px-1.5 py-0.5"
                              title={`${c.country}: ${money(c.revenue, currency)} from ${c.counts} sales`}
                            >
                              {c.country} {c.revenue.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{money(it.revenue, null)}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">{it.counts} sales</p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <OwnerDot hex={owner ? hexOf(owner) : UNASSIGNED_HEX} hollow={!owner} />
                        <select
                          value={owner ?? ''}
                          onChange={(e) => assign(it.itemId, e.target.value || null)}
                          className={`text-xs rounded-lg border px-2 py-1.5 max-w-[9rem] bg-white dark:bg-gray-800 ${
                            owner
                              ? 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
                              : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <option value="">Unassigned</option>
                          {owners.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="text-center pb-4">
              <button
                onClick={() => {
                  if (confirm('Forget every owner name and assignment saved in this browser?')) clearAll();
                }}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              >
                Reset saved owners
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
