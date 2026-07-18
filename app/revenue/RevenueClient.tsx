'use client';

import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOwnerMap } from '@/hooks/useOwnerMap';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  parseLineReport,
  splitByOwner,
  allocate,
  combineReports,
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
}

const ALL = '__all__';

// v2 = THB per 1 JPY. v1 stored THB per 100 JPY, so reusing the key would silently reread a saved
// "23.15" as 23.15 THB/yen and overstate every THB figure 100x, with nothing to flag it. Bumping
// the key drops the stale value and asks for the rate again — the only safe migration for a number
// whose units changed.
const RATE_KEY = 'lsr-revenue-rate-v2';

// The uploaded CSV is read with FileReader and parsed in this component. It is never POSTed
// anywhere — no fetch, no server action, no DB. Keep it that way: this file holds real payout data.

function money(n: number | null | undefined, currency: string | null) {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString()}${currency ? ` ${currency}` : ''}`;
}

const OWNER_COLORS = [
  'bg-green-50 text-green-700 border-green-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-pink-50 text-pink-700 border-pink-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
];

// Same hues as OWNER_COLORS, in the same order, so an owner's chip and their chart line match.
// Recharts needs real colour values, not Tailwind class names.
const OWNER_HEX = ['#16a34a', '#2563eb', '#9333ea', '#d97706', '#db2777', '#0891b2'];
const UNASSIGNED_HEX = '#a8a29e';

/** 528925 -> "529k", so the Y axis doesn't need six digits per tick. */
function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

export default function RevenueClient() {
  const router = useRouter();
  const { owners, loaded, ownerOf, assign, assignMany, addOwner, removeOwner, clearAll } = useOwnerMap();

  const [months, setMonths] = useState<LoadedMonth[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [copied, setCopied] = useState(false);
  // THB per 1 JPY (e.g. 0.2315). Thai FX boards quote yen per 100, so divide theirs by 100.
  const [rate, setRate] = useState('');
  // Owners whose pack breakdown is expanded. Keyed by owner name, so a row stays open while you
  // reassign packs around it.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setRate(localStorage.getItem(RATE_KEY) ?? ''); } catch {}
  }, []);

  function updateRate(v: string) {
    setRate(v);
    try { localStorage.setItem(RATE_KEY, v); } catch {}
  }

  const rateNum = Number(rate);
  const rateOk = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum > 0;

  const toggleOwner = useCallback((owner: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(owner)) next.add(owner);
      return next;
    });
  }, []);

  const colorOf = useCallback(
    (name: string) => OWNER_COLORS[owners.indexOf(name) % OWNER_COLORS.length] ?? OWNER_COLORS[0],
    [owners]
  );

  /** Chart line colour for an owner — same index as their chip, so the two always agree. */
  const hexOf = useCallback(
    (name: string) => {
      if (name === UNASSIGNED) return UNASSIGNED_HEX;
      const i = owners.indexOf(name);
      return i < 0 ? UNASSIGNED_HEX : OWNER_HEX[i % OWNER_HEX.length];
    },
    [owners]
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
        const report = parseLineReport(await file.text());
        const key = periodKey(report);
        parsed.push({ key, label: periodLabel(key), fileName: file.name, report });
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

  const split = useMemo(() => {
    if (!report || !loaded) return null;
    return splitByOwner(report.items, ownerOf, report);
  }, [report, loaded, ownerOf]);

  // Each month split on its own — the chart's series. Kept separate from `split` because the
  // combined view deliberately loses the month axis.
  const monthlySplits = useMemo(() => {
    if (!loaded || months.length < 2) return null;
    return months.map((m) => ({
      key: m.key,
      label: m.label,
      split: splitByOwner(m.report.items, ownerOf, m.report),
    }));
  }, [months, loaded, ownerOf]);

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

  const chartData = useMemo(() => {
    if (!monthlySplits) return null;
    return monthlySplits.map((m) => {
      const row: Record<string, string | number> = { month: m.label };
      // 0, not undefined: an owner with no packs that month genuinely earned nothing, and a gap
      // in the line would read as "no data" instead.
      for (const o of chartOwners) row[o] = 0;
      // THB when a rate is set (what the team actually pays out in); JPY otherwise. A constant
      // rate scales every point identically, so the trend shape is the same either way.
      for (const s of m.split.shares) {
        const jpy = s.afterTax ?? 0;
        row[s.owner] = rateOk ? Math.round(jpy * rateNum) : jpy;
      }
      return row;
    });
  }, [monthlySplits, chartOwners, rateOk, rateNum]);

  const chartCurrency = rateOk ? 'THB' : 'JPY';

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

  function download() {
    const blob = new Blob([`﻿${buildExport()}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-split-${report?.period?.from?.replace(/\./g, '') ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Use Download CSV instead.');
    }
  }

  async function signOut() {
    await fetch('/api/revenue/session', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-sm text-green-600 hover:underline flex-shrink-0">
              ← Rankings
            </Link>
            <span className="text-gray-200">·</span>
            <h1 className="font-bold text-gray-800 truncate">🔒 Revenue distribution</h1>
          </div>
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
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
          className={`bg-white rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-[#06c755] bg-green-50/40' : 'border-gray-200'
          }`}
        >
          <p className="text-sm font-medium text-gray-700">
            {months.length ? 'Add more months' : 'Upload your LINE revenue reports'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Drag one or more .csv files here, or{' '}
            <button onClick={() => fileRef.current?.click()} className="text-green-600 hover:underline">
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

          {months.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
              {months.map((m) => (
                <span
                  key={m.key}
                  title={m.fileName}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-200"
                >
                  {m.label}
                  <button
                    onClick={() => removeMonth(m.key)}
                    className="w-4 h-4 rounded-full hover:bg-black/10 leading-none text-gray-400"
                    title={`Remove ${m.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mt-3 text-left">
              {error}
            </p>
          )}
        </section>

        {/* Month selector — only earns its space once there's more than one month. */}
        {months.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Showing</span>
            {[{ key: ALL, label: `All ${months.length} months` }, ...months].map((m) => (
              <button
                key={m.key}
                onClick={() => setSelected(m.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selected === m.key
                    ? 'bg-[#06c755] text-white border-[#06c755]'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
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
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700">Report summary</h2>
                {report.period && (
                  <span className="text-xs text-gray-400">
                    {report.period.from} – {report.period.to}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400">Packs sold</p>
                  <p className="text-lg font-bold text-gray-700 leading-tight">{report.items.length}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400">Revenue share</p>
                  <p className="text-lg font-bold text-gray-700 leading-tight">
                    {money(report.rowTotal, currency)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-gray-400">
                    Withholding tax
                    {report.footer.withholdingTaxRate != null && ` (${report.footer.withholdingTaxRate}%)`}
                  </p>
                  <p className="text-lg font-bold text-red-500 leading-tight">
                    −{money(report.footer.withholdingTaxAmount, currency)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-green-600">Amount payable</p>
                  <p className="text-lg font-bold text-green-700 leading-tight">
                    {money(report.footer.amountPayable, currency)}
                  </p>
                </div>
              </div>

              {report.warnings.map((w) => (
                <p
                  key={w}
                  className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mt-3"
                >
                  ⚠ {w}
                </p>
              ))}
            </section>

            {/* Owners roster */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-700">Owners</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Saved in this browser, so next month&apos;s upload fills itself in.
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {owners.map((o) => (
                  <span
                    key={o}
                    className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium border ${colorOf(o)}`}
                  >
                    {o}
                    <button
                      onClick={() => removeOwner(o)}
                      className="w-4 h-4 rounded-full hover:bg-black/10 leading-none"
                      title={`Remove ${o} and unassign their packs`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!owners.length && <span className="text-xs text-gray-400">No owners yet. Add one below.</span>}
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
                  className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm bg-white text-gray-900 placeholder:text-gray-400"
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
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  <span className="text-xs text-gray-400">
                    Assign the {unassignedIds.length} remaining to
                  </span>
                  <select
                    value={bulkOwner}
                    onChange={(e) => setBulkOwner(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-xs bg-white text-gray-700"
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
                    className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}
            </section>

            {/* Trend — only meaningful with more than one month. THB once a rate is entered
                (that's the money the team splits); JPY until then rather than an empty chart. */}
            {chartData && chartData.length > 1 && (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h2 className="font-bold text-gray-700">Income by owner</h2>
                  <span className="text-xs text-gray-400">
                    After-tax {chartCurrency} per month
                    {!rateOk && ' — enter an exchange rate above to see this in THB'}
                  </span>
                </div>

                {/* Numeric height, matching RankGraph: ResponsiveContainer with height="100%"
                    measured the wrapper at 8px here and drew nothing. */}
                <div className="mt-4 -ml-2">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={compact}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
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
                        formatter={(value, name) => {
                          // Chart values are already in chartCurrency (THB when a rate is set, JPY
                          // otherwise). Show just that one figure — the header already says which.
                          const v = typeof value === 'number' ? value : Number(value ?? 0);
                          return [
                            `${Math.round(v).toLocaleString()} ${chartCurrency}`,
                            String(name) === UNASSIGNED ? 'Unassigned' : String(name),
                          ];
                        }}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        }}
                      />
                      <Legend
                        // null disables recharts' own sort, so the legend keeps the Line render
                        // order — chartOwners, which is total-earnings descending. Biggest on the
                        // left. (Its default reorders to alphabetical.)
                        itemSorter={null}
                        formatter={(v: string) => (
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {v === UNASSIGNED ? 'Unassigned' : v}
                          </span>
                        )}
                      />
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
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                  Each line is one owner&apos;s after-tax share for that month, using your current
                  owner assignments applied to every month. Unassigned packs are the dashed line.
                  {rateOk &&
                    ` THB is converted at 1 JPY = ${rateNum} for every month, so older months are estimates — each month really settled at its own rate.`}
                </p>
              </section>
            )}

            {/* Result — deliberately ABOVE the per-pack list: it's the answer you came for, and
                the assignment list runs to ~90 rows, so burying the totals under it means
                scrolling past everything to see whether the split moved. */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700">Revenue sharing</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={download}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#06c755] text-white hover:bg-[#05b04a]"
                  >
                    Download CSV
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                <label htmlFor="fx" className="text-xs text-gray-500">
                  Exchange rate: <span className="font-medium text-gray-700">1 JPY</span> =
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
                  className="w-24 px-2 py-1 rounded-lg border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm bg-white text-gray-900 placeholder:text-gray-300"
                />
                <span className="text-xs text-gray-500">THB</span>
                <span className="text-[11px] text-gray-400">
                  {rateOk
                    ? months.length > 1
                      ? 'This one rate is applied to every loaded month, so THB for older months is an estimate — each month really settled at its own rate.'
                      : 'Use the rate your bank actually gave you, so the THB column matches the money that landed.'
                    : 'Enter a rate to fill the THB column.'}
                </span>
              </div>

              {split.unassignedCount > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mt-3">
                  ⚠ {split.unassignedCount === 1
                    ? '1 pack still has no owner. Its'
                    : `${split.unassignedCount} packs still have no owner. Their`}{' '}
                  revenue is parked in the Unassigned row below.
                </p>
              )}

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-400 border-b border-gray-100">
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
                  <tbody className="divide-y divide-gray-50">
                    {split.shares.map((s, i) => {
                      const isUn = s.owner === UNASSIGNED;
                      const open = expanded.has(s.owner);
                      return (
                        <Fragment key={s.owner}>
                          <tr className={isUn ? 'bg-amber-50/50' : ''}>
                            <td className="py-2.5">
                              <button
                                onClick={() => toggleOwner(s.owner)}
                                aria-expanded={open}
                                title={open ? 'Hide packs' : 'Show packs, biggest earner first'}
                                className="flex items-center gap-1.5 group"
                              >
                                <span
                                  className={`text-[9px] text-gray-400 group-hover:text-gray-600 transition-transform ${
                                    open ? 'rotate-90' : ''
                                  }`}
                                  aria-hidden
                                >
                                  ▶
                                </span>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                                    isUn ? 'bg-amber-50 text-amber-700 border-amber-200' : colorOf(s.owner)
                                  }`}
                                >
                                  {isUn ? 'Unassigned' : s.owner}
                                </span>
                              </button>
                            </td>
                            <td className="text-right text-gray-500 text-xs">{s.items}</td>
                            <td className="text-right text-gray-500 text-xs hidden sm:table-cell">{s.counts}</td>
                            <td className="text-right text-gray-500 text-xs">{s.pct.toFixed(1)}%</td>
                            <td className="text-right text-gray-700">{money(s.pretax, null)}</td>
                            <td className="text-right font-bold text-green-700">{money(s.afterTax, null)}</td>
                            <td className="text-right font-bold text-gray-700">{thb(thbParts?.[i])}</td>
                          </tr>

                          {/* One real <tr> per pack, so every figure lands under the header it
                              belongs to. Share is a slice of the WHOLE report, matching what the
                              owner row above means by Share — a column has to mean one thing, or
                              the child percentages quietly contradict the parent's. */}
                          {open &&
                            s.packs.map((p, n) => (
                              <tr
                                key={p.itemId}
                                className={`text-xs ${isUn ? 'bg-amber-50/30' : 'bg-gray-50/60'}`}
                              >
                                <td className="py-1.5 pl-5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-4 text-right text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                                      {n + 1}
                                    </span>
                                    <span className="w-6 h-6 rounded bg-white border border-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
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
                                        <span className="text-[8px] text-gray-300">{p.type.slice(0, 2)}</span>
                                      )}
                                    </span>
                                    <span className="truncate text-gray-600" title={p.title}>
                                      {p.title}
                                    </span>
                                  </div>
                                </td>
                                {/* Packs: a single pack has no count of its own. */}
                                <td />
                                <td className="text-right text-gray-400 hidden sm:table-cell">{p.counts}</td>
                                <td className="text-right text-gray-400">
                                  {report.rowTotal > 0
                                    ? `${((p.revenue / report.rowTotal) * 100).toFixed(1)}%`
                                    : '—'}
                                </td>
                                <td className="text-right text-gray-600">{money(p.revenue, null)}</td>
                                <td className="text-right text-green-700/80">
                                  {money(packBreakdown?.[i]?.jpy?.[n], null)}
                                </td>
                                <td className="text-right text-gray-600">
                                  {thb(packBreakdown?.[i]?.thb?.[n])}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-100 font-bold">
                      <td className="py-2.5 text-gray-700">Total</td>
                      <td className="text-right text-gray-500 text-xs">{report.items.length}</td>
                      <td className="text-right text-gray-500 text-xs hidden sm:table-cell">
                        {split.shares.reduce((a, s) => a + s.counts, 0)}
                      </td>
                      <td className="text-right text-gray-500 text-xs">100%</td>
                      <td className="text-right text-gray-700">{money(report.rowTotal, null)}</td>
                      <td className="text-right text-green-700">
                        {/* Every row shows '—' when after-tax is unknown; the total must not
                            contradict them with a confident 0. */}
                        {split.shares.some((s) => s.afterTax != null)
                          ? money(
                              split.shares.reduce((a, s) => a + (s.afterTax ?? 0), 0),
                              null
                            )
                          : '—'}
                      </td>
                      <td className="text-right text-gray-700">
                        {thbParts ? thb(thbParts.reduce((a, b) => a + b, 0)) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                LINE pays in JPY.{' '}
                {split.exact
                  ? 'After-tax figures split the report’s Amount Payable and add up to it exactly.'
                  : 'After-tax figures are estimated by applying the withholding rate, because this file’s rows do not add up to its stated total.'}
                {rateOk &&
                  ` THB is converted at 1 JPY = ${rateNum} THB and also adds up exactly, but it is only as accurate as that rate — your bank’s rate on payout day is the one that decides what actually arrives.`}{' '}
                Expand an owner (▶) to list their packs, biggest earner first; every column there
                adds up to that owner’s row.
              </p>
            </section>

            {/* Assign */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-bold text-gray-700">Assign an owner to each pack</h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    split.unassignedCount
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-green-50 text-green-700 border border-green-200'
                  }`}
                >
                  {split.unassignedCount
                    ? `${split.unassignedCount} left`
                    : `All ${report.items.length} assigned`}
                </span>
              </div>

              <div className="mt-4 divide-y divide-gray-50">
                {report.items.map((it) => {
                  const owner = ownerOf(it.itemId);
                  return (
                    <div key={it.itemId} className="py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
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
                          <span className="text-xs text-gray-300">{it.type.slice(0, 2)}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{it.title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[11px] text-gray-400">ID {it.itemId}</span>
                          {it.byCountry.map((c) => (
                            <span
                              key={c.country}
                              className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5"
                              title={`${c.country}: ${money(c.revenue, currency)} from ${c.counts} sales`}
                            >
                              {c.country} {c.revenue.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <p className="text-sm font-bold text-gray-700">{money(it.revenue, null)}</p>
                        <p className="text-[11px] text-gray-400">{it.counts} sales</p>
                      </div>

                      <select
                        value={owner ?? ''}
                        onChange={(e) => assign(it.itemId, e.target.value || null)}
                        className={`text-xs rounded-lg border px-2 py-1.5 flex-shrink-0 max-w-[9rem] ${
                          owner ? colorOf(owner) : 'bg-amber-50 text-amber-700 border-amber-200'
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
                  );
                })}
              </div>
            </section>

            <div className="text-center pb-4">
              <button
                onClick={() => {
                  if (confirm('Forget every owner name and assignment saved in this browser?')) clearAll();
                }}
                className="text-xs text-gray-400 hover:text-red-500"
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
