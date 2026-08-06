import type { Client } from '@libsql/client';
import { FEATURED_COUNTRIES } from './countries';
import { categoryOf, CATEGORY_MAP } from './categories';
import { characterOf, CHARACTER_MAP } from './characters';

/**
 * Market analytics for /insights, computed from the data we already collect.
 *
 * Read budget (the reason for the shapes below — this DB has had a read-quota outage):
 *   - one 1,500-row pull of the current snapshot across the 3 markets, which feeds EVERY
 *     distribution on the page (format, character, price, creators, sequels, #1)
 *   - 3,000 rows for churn (the -24h and -7d snapshots, product ids only)
 *   - ~42 single-row seeks for the 7-day #1 timeline, sent as 2 batches
 * Every rankings access is an index seek on idx_rankings_country_date_hour or the composite PK;
 * nothing here scans the table. Total ~4,500 rows per render, and the page is ISR-cached for an
 * hour, so this costs ~110k reads/day worst case.
 */

export interface Share {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface CountryInsight {
  country: string;
  packs: number;
  /** Format mix across the whole top-500. */
  formats: Share[];
  /** Animated share in the top 50 vs across the whole chart — over/under-indexing at the top. */
  animatedTop50Pct: number;
  animatedOverallPct: number;
  characters: Share[];
  /** Most common price points, USD. */
  prices: { price: number; count: number; pct: number }[];
  pricedPacks: number;
  medianPrice: number | null;
  distinctCreators: number;
  top10CreatorSharePct: number;
  topCreators: { author: string; packs: number }[];
  /** Titles that look like a numbered sequel — the "series" signal. */
  sequelPct: number;
  /** Share of the chart still present 24h / 7d later. */
  overlap24hPct: number | null;
  overlap7dPct: number | null;
  newPerDay: number | null;
  newPerWeek: number | null;
  /** Who held #1 on each of the last 7 days, oldest first. */
  topSpot: { date: string; name: string; author: string | null }[];
  distinctNo1: number;

  /** Packs that entered this week, and how their mix differs from the chart as a whole. The chart
   *  is what has accumulated; new entrants are what is working NOW. */
  entrants: {
    count: number;
    characters: { key: string; label: string; chartPct: number; newPct: number; edge: number }[];
    animatedPct: number;
  } | null;
  /** Per character: share of the top 50 vs share of the whole chart. Positive edge = it does not
   *  just appear often, it climbs. Share alone cannot tell you that. */
  characterEdge: { key: string; label: string; chartPct: number; top50Pct: number; edge: number }[];
  /** Median rank at each common price point — does charging more cost you position? */
  priceVsRank: { price: number; medianRank: number; count: number }[];
  /** Do numbered instalments actually outperform originals? */
  sequels: { sequelMedian: number | null; originalMedian: number | null; sequelCount: number; originalCount: number };
}

/**
 * The all-markets view. Deliberately NOT the sum of the three columns: a pack charting in Japan
 * and Thailand is ONE pack with reach 2, not two packs. Everything here counts each pack once,
 * which is what makes `reach` and `travelers` possible — the cross-market picture is the thing a
 * per-country column structurally cannot show.
 */
export interface OverallInsight {
  distinctPacks: number;
  chartSlots: number;
  distinctCreators: number;
  /** How many packs chart in exactly 1, 2 or 3 markets. */
  reach: { markets: number; packs: number; pct: number }[];
  formats: Share[];
  characters: Share[];
  prices: { price: number; count: number; pct: number }[];
  medianPrice: number | null;
  /** Packs charting in every market, best rank first. */
  travelers: { id: string; name: string; author: string | null; bestRank: number; countries: string[] }[];
  /** Which character types travel: share of that character's packs charting in 2+ markets. */
  characterTravel: { key: string; label: string; packs: number; multiPct: number }[];
}

export interface MarketInsights {
  asOf: string | null;
  countries: CountryInsight[];
  overall: OverallInsight;
}

const ccUnionSql = (n: number) =>
  Array.from({ length: n }, (_, i) => (i === 0 ? 'SELECT ? AS country' : 'UNION ALL SELECT ?')).join(' ');

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);

/** Median of an unsorted list; null when empty. Median rather than mean because a single pack
 *  sitting at #499 would drag an average badly in a 500-row chart. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Numbered sequels: "vol.2", "V.3", "… 2", "Part 4". A pack whose title carries a number is
 *  almost always an instalment of a proven character rather than a fresh idea. */
const SEQUEL_RE = /(\bvol\b|\bv\.?\s*\d|\bpart\b|\b[2-9]\b|\b1[0-9]\b)/i;

function shares(counts: Map<string, number>, total: number, label: (k: string) => string): Share[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: label(key), count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

export async function getMarketInsights(client: Client): Promise<MarketInsights> {
  const CC: string[] = [...FEATURED_COUNTRIES];

  // ── current snapshot across all markets, one pass ────────────────────────
  const cur = await client.execute({
    sql: `WITH snap AS (
            SELECT c.country AS country,
              (SELECT snapshot_date FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS d,
              (SELECT snapshot_hour FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS h
            FROM (${ccUnionSql(CC.length)}) AS c
          )
          SELECT r.country, r.rank, s.d AS snapshot_date, s.h AS snapshot_hour,
                 p.id, p.name, p.author, p.sticker_type, p.character_type, p.price
          FROM snap s
          JOIN rankings r ON r.country = s.country AND r.snapshot_date = s.d AND r.snapshot_hour = s.h
          JOIN products p ON p.id = r.product_id`,
    args: CC,
  });

  type Row = {
    country: string; rank: number; snapshot_date: string; snapshot_hour: number;
    id: string; name: string; author: string | null; sticker_type: string | null;
    character_type: string | null; price: number | null;
  };
  const rows = cur.rows as unknown as Row[];
  const byCountry = new Map<string, Row[]>(CC.map((c) => [c, []]));
  for (const r of rows) byCountry.get(String(r.country))?.push(r);

  const asOf =
    rows.length > 0
      ? [...rows].sort((a, b) =>
          `${b.snapshot_date}${String(b.snapshot_hour).padStart(2, '0')}`.localeCompare(
            `${a.snapshot_date}${String(a.snapshot_hour).padStart(2, '0')}`
          )
        )[0].snapshot_date
      : null;

  // ── churn: the -24h and -7d snapshots (ids only) ─────────────────────────
  const pastIds = new Map<string, Set<string>>(); // `${cc}|${days}` -> ids
  for (const cc of CC) {
    const list = byCountry.get(cc) ?? [];
    if (!list.length) continue;
    const { snapshot_date: d, snapshot_hour: h } = list[0];
    for (const days of [1, 7]) {
      const target = new Date(`${d}T00:00:00Z`);
      target.setUTCDate(target.getUTCDate() - days);
      const td = target.toISOString().slice(0, 10);
      // Newest snapshot at or before the target moment — an index seek, not a scan.
      const snap = await client.execute({
        sql: `SELECT snapshot_date, snapshot_hour FROM rankings
              WHERE country = ? AND (snapshot_date < ? OR (snapshot_date = ? AND snapshot_hour <= ?))
              ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`,
        args: [cc, td, td, h],
      });
      const s = snap.rows[0];
      if (!s) continue;
      const ids = await client.execute({
        sql: `SELECT product_id FROM rankings WHERE country = ? AND snapshot_date = ? AND snapshot_hour = ?`,
        args: [cc, String(s.snapshot_date), Number(s.snapshot_hour)],
      });
      pastIds.set(`${cc}|${days}`, new Set(ids.rows.map((x) => String(x.product_id))));
    }
  }

  // ── who held #1 on each of the last 7 days ───────────────────────────────
  // Two batches instead of 42 round trips. Each statement is a single-row index seek: first the
  // last hour we captured that day, then the rank-1 row at exactly that (country, date, hour).
  const dayList: string[] = [];
  if (asOf) {
    for (let i = 6; i >= 0; i--) {
      const t = new Date(`${asOf}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() - i);
      dayList.push(t.toISOString().slice(0, 10));
    }
  }
  const pairs = CC.flatMap((cc) => dayList.map((d) => ({ cc, d })));
  const hourRes = pairs.length
    ? await client.batch(
        pairs.map(({ cc, d }) => ({
          sql: `SELECT snapshot_hour FROM rankings WHERE country = ? AND snapshot_date = ? ORDER BY snapshot_hour DESC LIMIT 1`,
          args: [cc, d],
        })),
        'read'
      )
    : [];
  const solvable = pairs
    .map((p, i) => ({ ...p, h: hourRes[i]?.rows[0] ? Number(hourRes[i].rows[0].snapshot_hour) : null }))
    .filter((p): p is { cc: string; d: string; h: number } => p.h !== null);
  const no1Res = solvable.length
    ? await client.batch(
        solvable.map(({ cc, d, h }) => ({
          sql: `SELECT p.name, p.author FROM rankings r JOIN products p ON p.id = r.product_id
                WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ? AND r.rank = 1`,
          args: [cc, d, h],
        })),
        'read'
      )
    : [];
  const no1ByCc = new Map<string, { date: string; name: string; author: string | null }[]>(
    CC.map((c) => [c, []])
  );
  solvable.forEach((p, i) => {
    const row = no1Res[i]?.rows[0];
    if (!row) return;
    no1ByCc.get(p.cc)?.push({ date: p.d, name: String(row.name), author: row.author ? String(row.author) : null });
  });

  // ── fold it all up in JS ─────────────────────────────────────────────────
  const countries: CountryInsight[] = CC.map((cc) => {
    const list = byCountry.get(cc) ?? [];
    const n = list.length;

    const fmt = new Map<string, number>();
    const chr = new Map<string, number>();
    const priceCount = new Map<number, number>();
    const creators = new Map<string, number>();
    let animatedAll = 0;
    let animatedTop50 = 0;
    let top50 = 0;
    let sequels = 0;
    const priceList: number[] = [];

    for (const r of list) {
      // Both helpers return a plain key string, not an object.
      const cat = categoryOf(r.sticker_type);
      fmt.set(cat, (fmt.get(cat) ?? 0) + 1);
      const ch = characterOf(r.character_type);
      if (ch) chr.set(ch, (chr.get(ch) ?? 0) + 1);

      if (cat === 'animated') animatedAll++;
      if (r.rank <= 50) {
        top50++;
        if (cat === 'animated') animatedTop50++;
      }
      if (typeof r.price === 'number' && r.price > 0) {
        priceCount.set(r.price, (priceCount.get(r.price) ?? 0) + 1);
        priceList.push(r.price);
      }
      if (r.author) creators.set(r.author, (creators.get(r.author) ?? 0) + 1);
      if (r.name && SEQUEL_RE.test(r.name)) sequels++;
    }

    const rankedCreators = [...creators.entries()].sort((a, b) => b[1] - a[1]);
    const top10Packs = rankedCreators.slice(0, 10).reduce((s, [, c]) => s + c, 0);
    priceList.sort((a, b) => a - b);

    const nowIds = new Set(list.map((r) => String(r.id)));
    const overlapWith = (days: number) => {
      const past = pastIds.get(`${cc}|${days}`);
      if (!past || past.size === 0 || n === 0) return { overlap: null, fresh: null };
      let kept = 0;
      for (const id of nowIds) if (past.has(id)) kept++;
      return { overlap: pct(kept, n), fresh: n - kept };
    };
    const d1 = overlapWith(1);
    const d7 = overlapWith(7);

    const topSpot = no1ByCc.get(cc) ?? [];

    // ── what's rising: profile the packs that entered in the last 7 days ───
    const week = pastIds.get(`${cc}|7`);
    const newRows = week ? list.filter((r) => !week.has(String(r.id))) : [];
    const newChr = new Map<string, number>();
    let newAnimated = 0;
    for (const r of newRows) {
      const ch = characterOf(r.character_type);
      if (ch) newChr.set(ch, (newChr.get(ch) ?? 0) + 1);
      if (categoryOf(r.sticker_type) === 'animated') newAnimated++;
    }
    const entrants =
      week && newRows.length >= 20
        ? {
            count: newRows.length,
            animatedPct: pct(newAnimated, newRows.length),
            // Compare each character's share among new entrants with its share of the whole
            // chart. A positive edge means the market is tilting toward it right now.
            characters: [...chr.keys()]
              .map((key) => {
                const chartPct = pct(chr.get(key) ?? 0, n);
                const newPct = pct(newChr.get(key) ?? 0, newRows.length);
                return {
                  key,
                  label: CHARACTER_MAP[key] ? `${CHARACTER_MAP[key].emoji} ${CHARACTER_MAP[key].label}` : key,
                  chartPct,
                  newPct,
                  edge: Math.round((newPct - chartPct) * 10) / 10,
                };
              })
              .filter((x) => (chr.get(x.key) ?? 0) >= 10) // ignore slivers where a few packs swing the %
              .sort((a, b) => b.edge - a.edge),
          }
        : null;

    // ── which characters actually climb, vs merely appear ─────────────────
    const chrTop50 = new Map<string, number>();
    for (const r of list) {
      if (r.rank > 50) continue;
      const ch = characterOf(r.character_type);
      if (ch) chrTop50.set(ch, (chrTop50.get(ch) ?? 0) + 1);
    }
    const characterEdge = [...chr.entries()]
      .filter(([, count]) => count >= 10)
      .map(([key, count]) => {
        const chartPct = pct(count, n);
        const t50 = pct(chrTop50.get(key) ?? 0, top50);
        return {
          key,
          label: CHARACTER_MAP[key] ? `${CHARACTER_MAP[key].emoji} ${CHARACTER_MAP[key].label}` : key,
          chartPct,
          top50Pct: t50,
          edge: Math.round((t50 - chartPct) * 10) / 10,
        };
      })
      .sort((a, b) => b.edge - a.edge);

    // ── price vs rank, and sequels vs originals ───────────────────────────
    const ranksByPrice = new Map<number, number[]>();
    const sequelRanks: number[] = [];
    const originalRanks: number[] = [];
    for (const r of list) {
      if (typeof r.price === 'number' && r.price > 0) {
        if (!ranksByPrice.has(r.price)) ranksByPrice.set(r.price, []);
        ranksByPrice.get(r.price)!.push(r.rank);
      }
      if (r.name && SEQUEL_RE.test(r.name)) sequelRanks.push(r.rank);
      else if (r.name) originalRanks.push(r.rank);
    }
    const priceVsRank = [...ranksByPrice.entries()]
      .filter(([, rs]) => rs.length >= 10) // a tier with 2 packs tells you nothing
      .map(([price, rs]) => ({ price, medianRank: median(rs) ?? 0, count: rs.length }))
      .sort((a, b) => a.price - b.price);

    return {
      country: cc,
      packs: n,
      formats: shares(fmt, n, (k) => CATEGORY_MAP[k]?.label ?? k),
      animatedTop50Pct: pct(animatedTop50, top50),
      animatedOverallPct: pct(animatedAll, n),
      characters: shares(chr, n, (k) =>
        CHARACTER_MAP[k] ? `${CHARACTER_MAP[k].emoji} ${CHARACTER_MAP[k].label}` : k
      ),
      prices: [...priceCount.entries()]
        .map(([price, count]) => ({ price, count, pct: pct(count, priceList.length) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
      pricedPacks: priceList.length,
      medianPrice: priceList.length ? priceList[Math.floor(priceList.length / 2)] : null,
      distinctCreators: creators.size,
      top10CreatorSharePct: pct(top10Packs, n),
      topCreators: rankedCreators.slice(0, 5).map(([author, packs]) => ({ author, packs })),
      sequelPct: pct(sequels, n),
      overlap24hPct: d1.overlap,
      overlap7dPct: d7.overlap,
      newPerDay: d1.fresh,
      newPerWeek: d7.fresh,
      topSpot,
      distinctNo1: new Set(topSpot.map((t) => t.name)).size,
      entrants,
      characterEdge,
      priceVsRank,
      sequels: {
        sequelMedian: median(sequelRanks),
        originalMedian: median(originalRanks),
        sequelCount: sequelRanks.length,
        originalCount: originalRanks.length,
      },
    };
  });

  // ── all-markets view, from the same rows (no extra queries) ──────────────
  // Fold the per-country rows into one row per PACK. `rows` has a row per (pack, country), so a
  // pack charting in two markets appears twice; counting those separately would double-count it
  // in every distribution and make "distinct packs" meaningless.
  type Pack = {
    id: string; name: string; author: string | null; sticker_type: string | null;
    character_type: string | null; price: number | null; countries: Set<string>; bestRank: number;
  };
  const packs = new Map<string, Pack>();
  for (const r of rows) {
    const id = String(r.id);
    const existing = packs.get(id);
    if (existing) {
      existing.countries.add(String(r.country));
      if (r.rank < existing.bestRank) existing.bestRank = r.rank;
    } else {
      packs.set(id, {
        id,
        name: r.name,
        author: r.author,
        sticker_type: r.sticker_type,
        character_type: r.character_type,
        price: r.price,
        countries: new Set([String(r.country)]),
        bestRank: r.rank,
      });
    }
  }

  const oFmt = new Map<string, number>();
  const oChr = new Map<string, number>();
  const oPriceCount = new Map<number, number>();
  const oPriceList: number[] = [];
  const oCreators = new Set<string>();
  const reachCount = new Map<number, number>();
  // packs per character, and how many of those reach 2+ markets
  const chrTotal = new Map<string, number>();
  const chrMulti = new Map<string, number>();

  for (const p of packs.values()) {
    const cat = categoryOf(p.sticker_type);
    oFmt.set(cat, (oFmt.get(cat) ?? 0) + 1);
    const ch = characterOf(p.character_type);
    if (ch) {
      oChr.set(ch, (oChr.get(ch) ?? 0) + 1);
      chrTotal.set(ch, (chrTotal.get(ch) ?? 0) + 1);
      if (p.countries.size >= 2) chrMulti.set(ch, (chrMulti.get(ch) ?? 0) + 1);
    }
    if (typeof p.price === 'number' && p.price > 0) {
      oPriceCount.set(p.price, (oPriceCount.get(p.price) ?? 0) + 1);
      oPriceList.push(p.price);
    }
    if (p.author) oCreators.add(p.author);
    reachCount.set(p.countries.size, (reachCount.get(p.countries.size) ?? 0) + 1);
  }
  oPriceList.sort((a, b) => a - b);

  const totalPacks = packs.size;
  const overall: OverallInsight = {
    distinctPacks: totalPacks,
    chartSlots: rows.length,
    distinctCreators: oCreators.size,
    reach: Array.from({ length: CC.length }, (_, i) => i + 1).map((markets) => ({
      markets,
      packs: reachCount.get(markets) ?? 0,
      pct: pct(reachCount.get(markets) ?? 0, totalPacks),
    })),
    formats: shares(oFmt, totalPacks, (k) => CATEGORY_MAP[k]?.label ?? k),
    characters: shares(oChr, totalPacks, (k) =>
      CHARACTER_MAP[k] ? `${CHARACTER_MAP[k].emoji} ${CHARACTER_MAP[k].label}` : k
    ),
    prices: [...oPriceCount.entries()]
      .map(([price, count]) => ({ price, count, pct: pct(count, oPriceList.length) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
    medianPrice: oPriceList.length ? oPriceList[Math.floor(oPriceList.length / 2)] : null,
    travelers: [...packs.values()]
      .filter((p) => p.countries.size === CC.length)
      .sort((a, b) => a.bestRank - b.bestRank)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name: p.name,
        author: p.author,
        bestRank: p.bestRank,
        countries: CC.filter((c) => p.countries.has(c)),
      })),
    // Only characters with enough packs to mean anything — a 2-pack character hitting 50% is noise.
    characterTravel: [...chrTotal.entries()]
      .filter(([, n]) => n >= 15)
      .map(([key, n]) => ({
        key,
        label: CHARACTER_MAP[key] ? `${CHARACTER_MAP[key].emoji} ${CHARACTER_MAP[key].label}` : key,
        packs: n,
        multiPct: pct(chrMulti.get(key) ?? 0, n),
      }))
      .sort((a, b) => b.multiPct - a.multiPct),
  };

  return { asOf, countries, overall };
}
