// Parsing + money math for LINE's creator revenue report (the CSV you download from LINE Creators
// Market). Pure functions only: no React, no DB, no network. The whole revenue feature runs in the
// browser, so the CSV never leaves the user's machine — see app/revenue/RevenueClient.tsx.
//
// Report shape (LINE's export, verified against a real June-2026 file):
//
//   From (GMT+9:00),To (GMT+9:00),Type,Item ID,Item Title,Country of Sale,Sales,Sales Counts,
//   Share Amount,Revenue Share Rate,Revenue Share (Pre-Tax),VAT,Revenue Share,Compensation
//   2026.06.01,2026.06.30,Sticker,40661638,Emoji With Hand 2,TH,1561,17,1561,35,546,0,546,N
//   ...
//   <~390 blank rows>
//   Creator ID,jQAKI9BspPkEextf
//   Country of Residence,TH
//   Total Revenue Share,1198275
//   Withholding Tax Rate,20.42
//   Withholding Tax Amount,244687
//   Amount Payable,953588
//
// Two traps this module exists to handle:
//  1. ONE STICKER SPANS MANY ROWS — one per Country of Sale. Summing rows naively double-counts a
//     pack; everything is grouped by Item ID first.
//  2. THERE ARE TWO REVENUE COLUMNS — "Revenue Share (Pre-Tax)" and "Revenue Share" (post-VAT).
//     Columns are matched by EXACT header name, never by index or substring, because a substring
//     match on "Revenue Share" silently grabs the pre-tax column and quietly pays people the wrong
//     amount.

export interface ItemCountry {
  country: string;
  revenue: number;
  counts: number;
}

export interface ReportItem {
  itemId: string;
  title: string;
  type: string;
  revenue: number;
  counts: number;
  byCountry: ItemCountry[];
}

export interface ReportFooter {
  creatorId: string | null;
  residence: string | null;
  totalRevenueShare: number | null;
  withholdingTaxRate: number | null;
  withholdingTaxAmount: number | null;
  amountPayable: number | null;
}

export interface ParsedReport {
  items: ReportItem[];
  footer: ReportFooter;
  period: { from: string; to: string } | null;
  /** Sum of every data row's "Revenue Share". Ground truth for the split. */
  rowTotal: number;
  /** True when rowTotal ties out with the footer's Total Revenue Share (±1 for rounding). */
  tiesOut: boolean;
  /** Always JPY — see REPORT_CURRENCY. */
  currency: string;
  warnings: string[];
}

// LINE Creators Market settles in yen, full stop — whatever the creator's residence and whichever
// country a pack sold in. The report says so three ways: its timestamps are GMT+9, and the 20.42%
// withholding is Japan's non-resident rate (20% + 2.1% reconstruction surtax), charged to a
// TH-resident creator because the income is Japanese-source.
//
// "Country of Residence" selects that TAX RATE. It is NOT a currency hint. Reading it as one
// labelled a Thai creator's yen as baht — the same number, off by ~4x in meaning.
export const REPORT_CURRENCY = 'JPY';

/** RFC4180-ish reader: handles quoted fields, escaped "" quotes, CRLF, and a leading BOM. */
export function parseCsvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    // A quote only opens a quoted field at the START of one. Mid-field it's a literal — e.g. an
    // unescaped title like `Cat 5" Tall`. Treating that as an opening quote would swallow every
    // following row into one field and silently corrupt the split. Matches Excel/Sheets leniency.
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "1,198,275" / " 546 " / "" -> number | null. Never returns NaN. */
function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const FOOTER_KEYS: Record<string, keyof ReportFooter> = {
  'creator id': 'creatorId',
  'country of residence': 'residence',
  'total revenue share': 'totalRevenueShare',
  'withholding tax rate': 'withholdingTaxRate',
  'withholding tax amount': 'withholdingTaxAmount',
  'amount payable': 'amountPayable',
};

export class ReportFormatError extends Error {}

export function parseLineReport(text: string): ParsedReport {
  const rows = parseCsvRows(text);
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() === 'Item ID'));
  if (headerIdx === -1) {
    throw new ReportFormatError(
      'This does not look like a LINE revenue report: no "Item ID" column found.'
    );
  }

  const header = rows[headerIdx].map((h) => h.trim());
  const at = (name: string) => header.findIndex((h) => h === name);
  const startsWith = (p: string) => header.findIndex((h) => h.startsWith(p));

  const cId = at('Item ID');
  const cTitle = at('Item Title');
  const cCountry = at('Country of Sale');
  const cRevenue = at('Revenue Share'); // exact: must NOT match "Revenue Share (Pre-Tax)"
  const cType = at('Type');
  const cCounts = at('Sales Counts');
  const cFrom = startsWith('From');
  const cTo = startsWith('To');

  const missing = (
    [
      ['Item ID', cId],
      ['Item Title', cTitle],
      ['Country of Sale', cCountry],
      ['Revenue Share', cRevenue],
    ] as const
  )
    .filter(([, i]) => i === -1)
    .map(([n]) => n);
  if (missing.length) {
    throw new ReportFormatError(`Report is missing required column(s): ${missing.join(', ')}.`);
  }

  const warnings: string[] = [];
  const footer: ReportFooter = {
    creatorId: null,
    residence: null,
    totalRevenueShare: null,
    withholdingTaxRate: null,
    withholdingTaxAmount: null,
    amountPayable: null,
  };

  const grouped = new Map<string, ReportItem>();
  let rowTotal = 0;
  let period: { from: string; to: string } | null = null;
  let mixedPeriod = false;
  let skippedRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const key = (r[0] ?? '').trim().toLowerCase();

    // The key/value summary block that trails the data rows.
    const footerKey = FOOTER_KEYS[key];
    if (footerKey) {
      const v = (r[1] ?? '').trim();
      if (footerKey === 'creatorId' || footerKey === 'residence') footer[footerKey] = v || null;
      else (footer[footerKey] as number | null) = num(v);
      continue;
    }

    const itemId = (r[cId] ?? '').trim();
    if (!itemId) continue; // blank padding row

    const revenue = num(r[cRevenue]);
    if (revenue == null) {
      skippedRows++;
      continue;
    }

    const from = cFrom >= 0 ? (r[cFrom] ?? '').trim() : '';
    const to = cTo >= 0 ? (r[cTo] ?? '').trim() : '';
    if (from && to) {
      if (!period) period = { from, to };
      else if (period.from !== from || period.to !== to) mixedPeriod = true;
    }

    const country = (r[cCountry] ?? '').trim().toUpperCase();
    const counts = (cCounts >= 0 ? num(r[cCounts]) : null) ?? 0;

    let item = grouped.get(itemId);
    if (!item) {
      item = {
        itemId,
        title: (r[cTitle] ?? '').trim() || `Item ${itemId}`,
        type: (cType >= 0 ? (r[cType] ?? '').trim() : '') || 'Unknown',
        revenue: 0,
        counts: 0,
        byCountry: [],
      };
      grouped.set(itemId, item);
    }
    item.revenue += revenue;
    item.counts += counts;
    rowTotal += revenue;

    const existing = item.byCountry.find((c) => c.country === country);
    if (existing) {
      existing.revenue += revenue;
      existing.counts += counts;
    } else item.byCountry.push({ country, revenue, counts });
  }

  const items = [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
  for (const it of items) it.byCountry.sort((a, b) => b.revenue - a.revenue);

  if (!items.length) throw new ReportFormatError('No sticker rows found in this report.');
  if (skippedRows) {
    warnings.push(`${skippedRows} row(s) had an unreadable "Revenue Share" value and were skipped.`);
  }
  if (mixedPeriod) {
    warnings.push('Rows cover more than one date range. Totals below combine every period in the file.');
  }

  const total = footer.totalRevenueShare;
  const tiesOut = total != null && Math.abs(rowTotal - total) <= 1;
  if (total != null && !tiesOut) {
    warnings.push(
      `The sticker rows add up to ${rowTotal.toLocaleString()}, but the report footer says the total is ` +
        `${total.toLocaleString()}. This file looks incomplete, so the after-tax column is an estimate.`
    );
  }
  if (total == null) {
    warnings.push('No "Total Revenue Share" row in the footer, so after-tax amounts cannot be verified.');
  }

  return {
    items,
    footer,
    period,
    rowTotal,
    tiesOut,
    currency: REPORT_CURRENCY,
    warnings,
  };
}

/**
 * Split `total` across `weights` so the parts sum to EXACTLY `total` (largest-remainder method).
 * Rounding each share independently loses or invents a few baht; when this drives real payouts,
 * "close enough" is a bug. Ties break toward the lower index for a stable, reproducible result.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !weights.length) return weights.map(() => 0);

  const exact = weights.map((w) => (w * total) / sum);
  const out = exact.map(Math.floor);
  let left = Math.round(total - out.reduce((a, b) => a + b, 0));

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

export interface OwnerShare {
  owner: string;
  items: number;
  counts: number;
  pretax: number;
  afterTax: number | null;
  pct: number;
  /** This owner's packs, biggest earner first — drives the expandable breakdown. */
  packs: ReportItem[];
}

export const UNASSIGNED = '__unassigned__';

export interface SplitResult {
  shares: OwnerShare[];
  unassignedCount: number;
  /** True when afterTax figures sum exactly to the footer's Amount Payable. */
  exact: boolean;
}

/**
 * Group items by owner and work out each owner's cut.
 *
 * After-tax is deliberately derived from the footer's Amount Payable rather than from each row,
 * because LINE withholds tax on the REPORT total, not per sticker. Two paths:
 *  - File ties out  -> allocate Amount Payable by weight; the parts sum to it exactly.
 *  - File is short  -> fall back to applying the tax rate per owner and flag it as inexact, since
 *    handing out the full Amount Payable across a partial row set would overpay.
 */
export function splitByOwner(
  items: ReportItem[],
  ownerOf: (itemId: string) => string | null | undefined,
  report: Pick<ParsedReport, 'footer' | 'rowTotal' | 'tiesOut'>
): SplitResult {
  const buckets = new Map<string, OwnerShare>();
  let unassignedCount = 0;

  for (const it of items) {
    const raw = ownerOf(it.itemId);
    const owner = raw && raw.trim() ? raw.trim() : UNASSIGNED;
    if (owner === UNASSIGNED) unassignedCount++;

    let b = buckets.get(owner);
    if (!b) {
      b = { owner, items: 0, counts: 0, pretax: 0, afterTax: null, pct: 0, packs: [] };
      buckets.set(owner, b);
    }
    b.items++;
    b.counts += it.counts;
    b.pretax += it.revenue;
    b.packs.push(it);
  }

  // Sorted here rather than inherited from the caller's ordering, so the breakdown is
  // biggest-earner-first regardless of what order items arrive in.
  for (const b of buckets.values()) b.packs.sort((x, y) => y.revenue - x.revenue);

  // Unassigned always sits last; real owners rank by size.
  const shares = [...buckets.values()].sort((a, b) => {
    if (a.owner === UNASSIGNED) return 1;
    if (b.owner === UNASSIGNED) return -1;
    return b.pretax - a.pretax;
  });

  const base = report.rowTotal;
  for (const s of shares) s.pct = base > 0 ? (s.pretax / base) * 100 : 0;

  const { amountPayable, withholdingTaxRate } = report.footer;
  let exact = false;

  if (report.tiesOut && amountPayable != null) {
    const parts = allocate(amountPayable, shares.map((s) => s.pretax));
    shares.forEach((s, i) => (s.afterTax = parts[i]));
    exact = true;
  } else if (withholdingTaxRate != null) {
    for (const s of shares) s.afterTax = Math.round(s.pretax * (1 - withholdingTaxRate / 100));
  }

  return { shares, unassignedCount, exact };
}
