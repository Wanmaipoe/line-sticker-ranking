'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOwnerMap } from '@/hooks/useOwnerMap';
import {
  parseLineReport,
  splitByOwner,
  ReportFormatError,
  UNASSIGNED,
  type ParsedReport,
} from '@/lib/revenue/report';

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

export default function RevenueClient() {
  const router = useRouter();
  const { owners, loaded, ownerOf, assign, assignMany, addOwner, removeOwner, clearAll } = useOwnerMap();

  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const colorOf = useCallback(
    (name: string) => OWNER_COLORS[owners.indexOf(name) % OWNER_COLORS.length] ?? OWNER_COLORS[0],
    [owners]
  );

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setCopied(false);
    try {
      const text = await file.text();
      setReport(parseLineReport(text));
      setFileName(file.name);
    } catch (e) {
      setReport(null);
      setFileName('');
      setError(
        e instanceof ReportFormatError
          ? e.message
          : 'Could not read that file. Make sure it is the .csv you downloaded from LINE Creators Market.'
      );
    }
  }, []);

  const split = useMemo(() => {
    if (!report || !loaded) return null;
    return splitByOwner(report.items, ownerOf, report);
  }, [report, loaded, ownerOf]);

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
      [],
      ['Owner', 'Packs', 'Sales counts', 'Revenue share (pre-tax)', 'Share %', 'After tax'],
      ...split.shares.map((s) => [
        s.owner === UNASSIGNED ? 'UNASSIGNED' : s.owner,
        String(s.items),
        String(s.counts),
        String(s.pretax),
        s.pct.toFixed(2),
        s.afterTax != null ? String(s.afterTax) : '',
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
            const f = e.dataTransfer.files?.[0];
            if (f) loadFile(f);
          }}
          className={`bg-white rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-[#06c755] bg-green-50/40' : 'border-gray-200'
          }`}
        >
          <p className="text-sm font-medium text-gray-700">
            {report ? 'Upload a different report' : 'Upload your LINE revenue report'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Drag the .csv here, or{' '}
            <button onClick={() => fileRef.current?.click()} className="text-green-600 hover:underline">
              choose a file
            </button>
            . It is read in your browser and never uploaded.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = ''; // let the same file be re-picked after a fix
            }}
          />
          {fileName && <p className="text-xs text-gray-500 mt-2">Loaded: {fileName}</p>}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mt-3 text-left">
              {error}
            </p>
          )}
        </section>

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

            {/* Result */}
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
                      <th className="text-right font-medium py-2 hidden sm:table-cell">Sales</th>
                      <th className="text-right font-medium py-2">Share</th>
                      <th className="text-right font-medium py-2">Pre-tax</th>
                      <th className="text-right font-medium py-2">After tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {split.shares.map((s) => {
                      const isUn = s.owner === UNASSIGNED;
                      return (
                        <tr key={s.owner} className={isUn ? 'bg-amber-50/50' : ''}>
                          <td className="py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                                isUn ? 'bg-amber-50 text-amber-700 border-amber-200' : colorOf(s.owner)
                              }`}
                            >
                              {isUn ? 'Unassigned' : s.owner}
                            </span>
                          </td>
                          <td className="text-right text-gray-500 text-xs">{s.items}</td>
                          <td className="text-right text-gray-500 text-xs hidden sm:table-cell">{s.counts}</td>
                          <td className="text-right text-gray-500 text-xs">{s.pct.toFixed(1)}%</td>
                          <td className="text-right text-gray-700">{money(s.pretax, null)}</td>
                          <td className="text-right font-bold text-green-700">{money(s.afterTax, null)}</td>
                        </tr>
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
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                {currency && `Amounts in ${currency}. `}
                {split.exact
                  ? 'After-tax figures split the report’s Amount Payable and add up to it exactly.'
                  : 'After-tax figures are estimated by applying the withholding rate, because this file’s rows do not add up to its stated total.'}
              </p>
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
