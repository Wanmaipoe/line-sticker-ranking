import type { Client } from '@libsql/client';
import { COUNTRY_ORDER, FEATURED_COUNTRIES } from './countries';

/**
 * "Who was #1 on each day, in each market" — the Daily #1 page.
 *
 * The chart is scraped hourly, so a day rarely has a single #1: on a typical Thai day three or
 * four packs trade the top slot. The day's champion is therefore the pack that HELD #1 for the
 * most hourly snapshots, not whichever one happened to be there at some arbitrary cut-off.
 */

// Each market's UTC offset. Snapshots are stamped in UTC (see scripts/scrape-line-official.mjs),
// but "the #1 sticker in Japan on 25 Aug" means the 25th as Japan lived it — a UTC day would cut
// every market's evening into the next row. None of these three observe DST, so a fixed offset is
// exact, not an approximation.
const UTC_OFFSET_HOURS: Record<string, number> = { jp: 9, th: 7, tw: 8 };

/** Window the Daily #1 page shows. Shared with /api/daily-champions so a refresh can never return
 *  a different span than the page was rendered with. */
export const DAILY_CHAMPION_DAYS = 60;

export interface ChampionHolder {
  id: string;
  name: string;
  image_url: string | null;
  author: string | null;
  sticker_type: string | null;
  /** Hourly snapshots this pack held #1 during the day. */
  hours: number;
}

export interface ChampionDay {
  /** Calendar day in the market's own timezone, YYYY-MM-DD. */
  date: string;
  /** Hourly snapshots that recorded a #1 (24 on a complete day; fewer if a scrape was missed). */
  hoursCovered: number;
  winner: ChampionHolder;
  /** Every other pack that also touched #1 that day, most hours first. */
  contenders: ChampionHolder[];
  /** Consecutive days up to and including this one that the winner has held the crown. */
  streak: number;
}

export interface CountryChampions {
  country: string;
  /** Newest day first. */
  days: ChampionDay[];
  /** Distinct packs that won a day in the window. */
  distinctWinners: number;
  /** Longest unbroken run of daily wins in the window. */
  longestStreak: { id: string; name: string; days: number } | null;
}

interface Rank1Row {
  country: string;
  date: string; // market-local day
  hour: number; // market-local hour, only used to break ties
  utcDate: string; // the row's raw UTC day, used to find the window edge
  product_id: string;
}

function addDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Daily #1 holders per market.
 *
 * Cost: served entirely by the partial index idx_rankings_rank1 (see
 * scripts/add-champion-index.mjs), which contains only rank-1 rows — 1 per country per hour. A
 * 60-day window is therefore ~1,440 index rows per country instead of the ~720k the general
 * country/date index would have to scan to find the same rows. EXPLAIN must read:
 *   SEARCH rankings USING COVERING INDEX idx_rankings_rank1 (country=? AND snapshot_date>?)
 * The second query is a PK seek per distinct winner (~1 row each). Both are safe on an ISR page.
 */
export async function getDailyChampions(
  client: Client,
  countries: readonly string[] = FEATURED_COUNTRIES,
  days = 60
): Promise<CountryChampions[]> {
  const ccPh = countries.map(() => '?').join(',');
  // Fetch two extra UTC days: shifting into a +7..+9 local calendar moves rows across the window
  // edges, so the raw range must be wider than the range actually rendered.
  const result = await client.execute({
    // `rank = 1` is written as a literal equality so the planner can match the partial index's
    // own WHERE clause. Binding it (`rank = ?`) would still work here, but keeping it literal
    // makes the dependency on the index obvious to the next reader.
    sql: `SELECT country, snapshot_date, snapshot_hour, product_id
          FROM rankings
          WHERE rank = 1
            AND country IN (${ccPh})
            AND snapshot_date >= date('now', ? || ' days')
          ORDER BY country ASC, snapshot_date ASC, snapshot_hour ASC`,
    args: [...countries, `-${days + 2}`],
  });

  // Re-stamp every snapshot into its market's local calendar before any grouping happens.
  const rows: Rank1Row[] = result.rows.map((r) => {
    const cc = r.country as string;
    const utcDate = r.snapshot_date as string;
    const utcHour = r.snapshot_hour as number;
    const [y, m, d] = utcDate.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d, utcHour) + (UTC_OFFSET_HOURS[cc] ?? 0) * 3_600_000);
    return {
      country: cc,
      date: shifted.toISOString().slice(0, 10),
      hour: shifted.getUTCHours(),
      utcDate,
      product_id: r.product_id as string,
    };
  });

  // Oldest UTC day actually fetched, per country — the window edge.
  const oldestUtc = new Map<string, string>();
  for (const row of rows) {
    const cur = oldestUtc.get(row.country);
    if (!cur || row.utcDate < cur) oldestUtc.set(row.country, row.utcDate);
  }

  // country -> day -> product -> { hours held, last hour held }
  const tally = new Map<string, Map<string, Map<string, { hours: number; lastHour: number }>>>();
  for (const row of rows) {
    const byDay = tally.get(row.country) ?? new Map();
    tally.set(row.country, byDay);
    const byProduct = byDay.get(row.date) ?? new Map();
    byDay.set(row.date, byProduct);
    const cur = byProduct.get(row.product_id) ?? { hours: 0, lastHour: -1 };
    cur.hours += 1;
    if (row.hour > cur.lastHour) cur.lastHour = row.hour;
    byProduct.set(row.product_id, cur);
  }

  // One PK-seek batch for every pack that appears anywhere in the window — a few dozen ids, not
  // one query per day.
  const ids = [...new Set(rows.map((r) => r.product_id))];
  const details = new Map<string, Omit<ChampionHolder, 'hours'>>();
  if (ids.length) {
    const products = await client.execute({
      sql: `SELECT id, name, image_url, author, sticker_type FROM products WHERE id IN (${ids
        .map(() => '?')
        .join(',')})`,
      args: ids,
    });
    for (const p of products.rows) {
      details.set(p.id as string, {
        id: p.id as string,
        name: p.name as string,
        image_url: (p.image_url as string | null) ?? null,
        author: (p.author as string | null) ?? null,
        sticker_type: (p.sticker_type as string | null) ?? null,
      });
    }
  }

  const holder = (id: string, hours: number): ChampionHolder => ({
    ...(details.get(id) ?? { id, name: id, image_url: null, author: null, sticker_type: null }),
    hours,
  });

  const out: CountryChampions[] = [];
  for (const cc of countries) {
    const byDay = tally.get(cc);
    if (!byDay) {
      out.push({ country: cc, days: [], distinctWinners: 0, longestStreak: null });
      continue;
    }

    // Drop the window's leading edge before anything is rendered. Every market is ahead of UTC, so
    // a local day draws its early hours from the PREVIOUS UTC day — the oldest local day in the
    // result is therefore always sourced from a UTC day that was only half fetched, and would show
    // up as e.g. "10/10h · partial day". That badge means "a scrape was missed", so leaving the
    // edge in would report a query artifact as missing data. A local day is fully covered only if
    // the UTC day before it was fetched too, which is exactly the test below. The query asks for
    // days + 2 so that discarding this edge still leaves `days` complete ones.
    const firstComplete = addDay(oldestUtc.get(cc) ?? '0000-01-01');

    // Oldest first while streaks are counted, then reversed for display.
    const ordered = [...byDay.entries()]
      .filter(([date]) => date >= firstComplete)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-days);

    const built: ChampionDay[] = [];
    let prevWinner: string | null = null;
    let prevDate: string | null = null;
    let run = 0;
    let longest: CountryChampions['longestStreak'] = null;

    for (const [date, byProduct] of ordered) {
      const ranked = [...byProduct.entries()].sort(
        // Most hours held wins the day. A genuine tie goes to whoever held it latest — the pack
        // that closed the day on top, which is also the one still trending upward.
        (a, b) => b[1].hours - a[1].hours || b[1].lastHour - a[1].lastHour
      );
      const [winnerId, winnerStats] = ranked[0];

      // A reign has to be UNBROKEN, so the run only continues when the previous entry is literally
      // yesterday. `ordered` skips days the scraper never captured, so comparing winners alone
      // would count straight through a gap and claim a longer reign than the page can even show —
      // e.g. a pack winning the 5th and the 7th, with the 6th missing, would be badged "2d reign"
      // on a day whose predecessor is not in the list.
      const consecutive = prevDate !== null && addDay(prevDate) === date;
      run = winnerId === prevWinner && consecutive ? run + 1 : 1;
      prevWinner = winnerId;
      prevDate = date;

      const winner = holder(winnerId, winnerStats.hours);
      if (!longest || run > longest.days) longest = { id: winnerId, name: winner.name, days: run };

      built.push({
        date,
        hoursCovered: ranked.reduce((n, [, s]) => n + s.hours, 0),
        winner,
        contenders: ranked.slice(1).map(([id, s]) => holder(id, s.hours)),
        streak: run,
      });
    }

    out.push({
      country: cc,
      days: built.reverse(),
      distinctWinners: new Set(built.map((d) => d.winner.id)).size,
      longestStreak: longest,
    });
  }

  return out.sort((a, b) => (COUNTRY_ORDER[a.country] ?? 99) - (COUNTRY_ORDER[b.country] ?? 99));
}
