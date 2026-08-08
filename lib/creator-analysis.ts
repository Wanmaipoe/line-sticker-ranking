import type { Product, CreatorRankHistoryPoint, PackLifecycles } from './db';
import { categoryOf, CATEGORY_MAP } from './categories';
import { characterOf, CHARACTER_MAP } from './characters';
import { SEQUEL_RE } from './insights';
import { COUNTRY_ORDER } from './countries';

/**
 * Per-creator analysis for the creator page's right column, computed from data the page already
 * fetches plus the seek-only lifecycle lookup (getPackLifecycles). Nothing here scales with
 * history size — this page is ISR-cached and crawled across ~500 creators.
 *
 * Server-only: called from page.tsx. The client component imports only the TYPES (erased at
 * compile), so this module — and lib/insights behind it — never enters the browser bundle.
 */

export interface CreatorMarketFoot {
  country: string;
  /** Packs currently in this market's top 500. */
  charting: number;
  /** Their best (lowest) current rank, with the pack that holds it. */
  best: { rank: number; id: string; name: string } | null;
}

export interface CreatorShare {
  key: string;
  label: string;
  count: number;
  pct: number;
}

export interface CreatorNewPacks {
  /** Packs whose first-ever chart appearance (any market) is within the window. */
  count: number;
  windowDays: number;
  stillCharting: number;
  exited: number;
  /** Names behind the counts, for the hover tooltips on the summary line. */
  stillNames: string[];
  /** The dropped-out packs with how many days each lasted, newest exit first not guaranteed. */
  exitedPacks: { name: string; days: number }[];
  /** Mean days from first to last appearance, among the ones that already dropped out. */
  avgLifespanDays: number | null;
  /** Lowest debut rank among the new packs — the hottest start. */
  bestDebut: { id: string; name: string; country: string; rank: number } | null;
  /** Biggest debut→now improvement, measured in the pack's entry market. */
  bestClimb: { id: string; name: string; country: string; from: number; to: number; delta: number } | null;
  /** The market new packs most often chart in first, when there is a clear favourite. */
  entryMarket: { country: string; count: number } | null;
}

export interface CreatorVeterans {
  /** Packs first seen over `thresholdDays` ago and still charting somewhere. */
  count: number;
  /** Their names, for the hover tooltip on the count. */
  names: string[];
  thresholdDays: number;
  /** How many of those veterans hold a rank in 2+ markets right now. */
  multiMarket: number;
  /** The longest run(s). More than one pack means a tie — usually several packs that were all
   *  already charting when our data begins, whose true order is unknowable. */
  longest: { days: number; openEnded: boolean; packs: { id: string; name: string }[] } | null;
  /** What the long-stayers have in common — top format/character, sequel share, median price. */
  traits: string[];
}

/** The "vs top creator" benchmark: the biggest creator on the Top Creators board, measured with
 *  the SAME analyzeCreator pass as the page's own creator so every number is like-for-like. */
export interface CreatorBenchmark {
  author: string;
  /** True when the page's creator IS the board's #1 — the benchmark is then #2. */
  youAreTop: boolean;
  analysis: CreatorAnalysis;
}

export interface CreatorAnalysis {
  /** Every pack of theirs we know (each has charted at least once). */
  totalPacks: number;
  /** Packs holding a rank in at least one featured market right now. */
  chartingNow: number;
  /** Packs charting in 2+ markets right now — the cross-border signal. */
  multiMarket: number;
  markets: CreatorMarketFoot[];
  /** Best rank reached in the 7-day chart window (among the packs the chart plots). */
  peak: { rank: number; id: string; name: string; country: string } | null;
  newPacks: CreatorNewPacks | null;
  veterans: CreatorVeterans | null;
  formats: CreatorShare[];
  /** Top characters among labelled packs; empty until the classifier has labelled some. */
  characters: CreatorShare[];
  /** % of the catalogue whose title reads as a numbered instalment (same regex as /insights). */
  sequelPct: number;
  /** Median canonical-USD price in cents, over packs with a known price. */
  medianPrice: number | null;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);
const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** "New" = first charted within this many days; "veteran" = older than this and still charting. */
const MONTH_DAYS = 30;

export function analyzeCreator(
  products: Product[],
  rankings: Record<string, Record<string, number | null>>,
  history: CreatorRankHistoryPoint[],
  lifecycles: PackLifecycles | null,
  countries: readonly string[]
): CreatorAnalysis | null {
  if (!products.length) return null;

  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const productOf = new Map(products.map((p) => [p.id, p]));

  // ── right now: footprint + reach, from the current ranks ─────────────────
  const markets: CreatorMarketFoot[] = countries.map((cc) => {
    let charting = 0;
    let best: CreatorMarketFoot['best'] = null;
    for (const p of products) {
      const r = rankings[p.id]?.[cc];
      if (typeof r !== 'number') continue;
      charting += 1;
      if (!best || r < best.rank) best = { rank: r, id: p.id, name: p.name };
    }
    return { country: cc, charting, best };
  });

  let chartingNow = 0;
  let multiMarket = 0;
  const marketsOf = new Map<string, number>();
  for (const p of products) {
    const n = countries.filter((cc) => typeof rankings[p.id]?.[cc] === 'number').length;
    marketsOf.set(p.id, n);
    if (n >= 1) chartingNow += 1;
    if (n >= 2) multiMarket += 1;
  }

  // ── this week's peak, from the chart's own history rows ──────────────────
  let peak: CreatorAnalysis['peak'] = null;
  for (const h of history) {
    if (!peak || h.rank < peak.rank) {
      peak = { rank: h.rank, id: h.product_id, name: nameOf.get(h.product_id) ?? h.product_id, country: h.country };
    }
  }

  // ── lifecycle: fold per-(pack,country) firsts/lasts into one row per pack ─
  interface PackLife {
    id: string;
    firstSeen: string; // earliest first_date across markets
    lastSeen: string; // latest last_date across markets
    entryCountry: string; // where it charted first (earliest date; COUNTRY_ORDER breaks ties)
    debutRank: number; // its rank in that first snapshot
  }
  const lives = new Map<string, PackLife>();
  if (lifecycles) {
    for (const l of lifecycles.packs) {
      const cur = lives.get(l.product_id);
      if (!cur) {
        lives.set(l.product_id, {
          id: l.product_id,
          firstSeen: l.first_date,
          lastSeen: l.last_date,
          entryCountry: l.country,
          debutRank: l.debut_rank,
        });
        continue;
      }
      if (
        l.first_date < cur.firstSeen ||
        (l.first_date === cur.firstSeen &&
          (COUNTRY_ORDER[l.country] ?? 99) < (COUNTRY_ORDER[cur.entryCountry] ?? 99))
      ) {
        cur.firstSeen = l.first_date;
        cur.entryCountry = l.country;
        cur.debutRank = l.debut_rank;
      }
      if (l.last_date > cur.lastSeen) cur.lastSeen = l.last_date;
    }
  }

  let newPacks: CreatorNewPacks | null = null;
  let veterans: CreatorVeterans | null = null;

  if (lifecycles && lives.size > 0) {
    // "Today" is the newest snapshot any of this creator's packs appears in — same clock as the
    // data, so a stalled scraper shifts the window rather than silently emptying it.
    const refDate = [...lives.values()].reduce((m, l) => (l.lastSeen > m ? l.lastSeen : m), '');
    const oldestRetained = Object.values(lifecycles.oldestByCountry)
      .filter((d): d is string => d != null)
      .sort()[0];

    const isNew = (l: PackLife) => dayDiff(l.firstSeen, refDate) <= MONTH_DAYS;
    const newOnes = [...lives.values()].filter(isNew);
    const vetOnes = [...lives.values()].filter((l) => !isNew(l) && (marketsOf.get(l.id) ?? 0) >= 1);

    // ── new this month ──────────────────────────────────────────────────────
    {
      const still = newOnes.filter((l) => (marketsOf.get(l.id) ?? 0) >= 1);
      const gone = newOnes.filter((l) => (marketsOf.get(l.id) ?? 0) === 0);
      const lifespans = gone.map((l) => dayDiff(l.firstSeen, l.lastSeen) + 1);

      let bestDebut: CreatorNewPacks['bestDebut'] = null;
      for (const l of newOnes) {
        if (!bestDebut || l.debutRank < bestDebut.rank) {
          bestDebut = { id: l.id, name: nameOf.get(l.id) ?? l.id, country: l.entryCountry, rank: l.debutRank };
        }
      }

      // Climb is measured inside the entry market so the two ranks are on the same ladder; a pack
      // that debuted in TH and now only charts in TW is a different story, not a climb.
      let bestClimb: CreatorNewPacks['bestClimb'] = null;
      for (const l of newOnes) {
        const now = rankings[l.id]?.[l.entryCountry];
        if (typeof now !== 'number') continue;
        const delta = l.debutRank - now;
        if (delta > 0 && (!bestClimb || delta > bestClimb.delta)) {
          bestClimb = {
            id: l.id,
            name: nameOf.get(l.id) ?? l.id,
            country: l.entryCountry,
            from: l.debutRank,
            to: now,
            delta,
          };
        }
      }

      let entryMarket: CreatorNewPacks['entryMarket'] = null;
      if (newOnes.length >= 2) {
        const byEntry = new Map<string, number>();
        for (const l of newOnes) byEntry.set(l.entryCountry, (byEntry.get(l.entryCountry) ?? 0) + 1);
        const top = [...byEntry.entries()].sort(
          (a, b) => b[1] - a[1] || (COUNTRY_ORDER[a[0]] ?? 99) - (COUNTRY_ORDER[b[0]] ?? 99)
        )[0];
        // Only claim a pattern when it is one: a 1-1-1 split has no favourite.
        if (top[1] > newOnes.length / 2) entryMarket = { country: top[0], count: top[1] };
      }

      newPacks = {
        count: newOnes.length,
        windowDays: MONTH_DAYS,
        stillCharting: still.length,
        exited: gone.length,
        stillNames: still.map((l) => nameOf.get(l.id) ?? l.id),
        exitedPacks: gone.map((l) => ({
          name: nameOf.get(l.id) ?? l.id,
          days: dayDiff(l.firstSeen, l.lastSeen) + 1,
        })),
        avgLifespanDays: lifespans.length
          ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length)
          : null,
        bestDebut,
        bestClimb,
        entryMarket,
      };
    }

    // ── chart veterans ──────────────────────────────────────────────────────
    {
      // Collect EVERY pack tied at the maximum, not the first encountered: several packs are
      // often all first seen on the oldest snapshot we retain, and naming one of those "the
      // longest" would be inventing an order the data cannot support.
      let longest: CreatorVeterans['longest'] = null;
      for (const l of vetOnes) {
        const days = dayDiff(l.firstSeen, refDate) + 1;
        if (!longest || days > longest.days) {
          longest = {
            days,
            // First seen on the oldest snapshot we retain — the run may predate our data.
            openEnded: oldestRetained != null && l.firstSeen <= oldestRetained,
            packs: [{ id: l.id, name: nameOf.get(l.id) ?? l.id }],
          };
        } else if (days === longest.days) {
          longest.packs.push({ id: l.id, name: nameOf.get(l.id) ?? l.id });
        }
      }

      const vetIds = new Set(vetOnes.map((l) => l.id));

      // What do the long-stayers have in common? Descriptive, not causal — the card says so.
      const traits: string[] = [];
      if (vetOnes.length > 0) {
        const fmt = new Map<string, number>();
        const chr = new Map<string, number>();
        const prices: number[] = [];
        let seq = 0;
        let labelled = 0;
        for (const id of vetIds) {
          const p = productOf.get(id);
          if (!p) continue;
          fmt.set(categoryOf(p.sticker_type), (fmt.get(categoryOf(p.sticker_type)) ?? 0) + 1);
          const ch = characterOf(p.character_type);
          if (ch) {
            chr.set(ch, (chr.get(ch) ?? 0) + 1);
            labelled += 1;
          }
          if (typeof p.price === 'number' && p.price > 0) prices.push(p.price);
          if (SEQUEL_RE.test(p.name)) seq += 1;
        }
        const topFmt = [...fmt.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topFmt) {
          traits.push(`${CATEGORY_MAP[topFmt[0]]?.label ?? topFmt[0]} ${pct(topFmt[1], vetOnes.length)}%`);
        }
        const topChr = [...chr.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topChr && labelled > 0) {
          const c = CHARACTER_MAP[topChr[0]];
          traits.push(`${c ? `${c.emoji} ${c.label}` : topChr[0]} ${pct(topChr[1], labelled)}%`);
        }
        if (seq > 0) traits.push(`numbered ${pct(seq, vetOnes.length)}%`);
        if (prices.length) {
          prices.sort((a, b) => a - b);
          traits.push(`$${(prices[Math.floor(prices.length / 2)] / 100).toFixed(2)} median`);
        }
      }

      veterans = {
        count: vetOnes.length,
        names: vetOnes.map((l) => nameOf.get(l.id) ?? l.id),
        thresholdDays: MONTH_DAYS,
        multiMarket: vetOnes.filter((l) => (marketsOf.get(l.id) ?? 0) >= 2).length,
        longest,
        traits,
      };
    }
  }

  // ── the catalogue: what they make, over every pack we know ───────────────
  const fmt = new Map<string, number>();
  const chr = new Map<string, number>();
  const prices: number[] = [];
  let sequels = 0;
  let labelled = 0;
  for (const p of products) {
    const cat = categoryOf(p.sticker_type);
    fmt.set(cat, (fmt.get(cat) ?? 0) + 1);
    const ch = characterOf(p.character_type);
    if (ch) {
      chr.set(ch, (chr.get(ch) ?? 0) + 1);
      labelled += 1;
    }
    if (typeof p.price === 'number' && p.price > 0) prices.push(p.price);
    if (SEQUEL_RE.test(p.name)) sequels += 1;
  }
  prices.sort((a, b) => a - b);

  return {
    totalPacks: products.length,
    chartingNow,
    multiMarket,
    markets,
    peak,
    newPacks,
    veterans,
    formats: [...fmt.entries()]
      .map(([key, count]) => ({
        key,
        label: CATEGORY_MAP[key]?.label ?? key,
        count,
        pct: pct(count, products.length),
      }))
      .sort((a, b) => b.count - a.count),
    characters: [...chr.entries()]
      .map(([key, count]) => ({
        key,
        label: CHARACTER_MAP[key] ? `${CHARACTER_MAP[key].emoji} ${CHARACTER_MAP[key].label}` : key,
        count,
        // Share of LABELLED packs: mixing in unlabelled ones would understate every character
        // until the classifier has worked through the catalogue.
        pct: pct(count, labelled),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    sequelPct: pct(sequels, products.length),
    medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : null,
  };
}
