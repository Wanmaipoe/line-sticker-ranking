import { createClient, type Client } from '@libsql/client';
import { COUNTRY_ORDER } from './countries';

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    // Deliberately fatal. `next build` prerenders /, /creators, /country/[code], /creator/[name]
    // and /sticker/[id], all of which read the database, so a missing URL fails the deploy — which
    // is right for a config error: shipping empty prerendered pages would hide it.
    //
    // What this replaces: `createClient({ url: process.env.TURSO_DATABASE_URL! })`. The `!` claimed
    // the var was always set, so a missing one surfaced as libsql's "URL_INVALID: The URL
    // 'undefined' is not in a valid format", thrown from client construction — outside the
    // try/catch each page wraps its QUERIES in, and naming nothing that points at the real cause.
    throw new Error(
      'TURSO_DATABASE_URL is not set. Builds prerender pages that read the database, so it must ' +
        'exist in the Vercel project env for Production and Preview (Settings > Environment ' +
        'Variables), not only at runtime.'
    );
  }

  _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}

export interface Product {
  id: string;
  name: string;
  image_url: string | null;
  author: string | null;
  price: number | null;
  price_currency: string | null;
  description: string | null;
  sticker_type: string | null;
  updated_at: string;
}

export interface Ranking {
  product_id: string;
  country: string;
  rank: number;
  snapshot_date: string;
  snapshot_hour: number;
  created_at: string;
}

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    image_url: row.image_url as string | null,
    author: row.author as string | null,
    price: row.price as number | null,
    price_currency: row.price_currency as string | null,
    description: row.description as string | null,
    sticker_type: row.sticker_type as string | null,
    updated_at: row.updated_at as string,
  };
}

export async function searchProducts(client: Client, query: string, limit = 20): Promise<Product[]> {
  const result = await client.execute({
    sql: `SELECT * FROM products WHERE name LIKE ? ORDER BY name LIMIT ?`,
    args: [`%${query}%`, limit],
  });
  return result.rows.map(toProduct);
}

export async function searchAuthors(client: Client, query: string, limit = 10) {
  const result = await client.execute({
    sql: `SELECT author, COUNT(*) as count
          FROM products
          WHERE author LIKE ? AND author IS NOT NULL
          GROUP BY author
          ORDER BY count DESC
          LIMIT ?`,
    args: [`%${query}%`, limit],
  });
  return result.rows.map((row) => ({
    author: row.author as string,
    count: row.count as number,
  }));
}

export async function getProductsByAuthor(client: Client, author: string, limit = 100): Promise<Product[]> {
  const result = await client.execute({
    sql: `SELECT * FROM products WHERE author = ? ORDER BY name LIMIT ?`,
    args: [author, limit],
  });
  return result.rows.map(toProduct);
}

export async function getProductsWithRankings(
  client: Client,
  productIds: string[],
  countries: string[]
): Promise<Record<string, Record<string, number | null>>> {
  if (!productIds.length) return {};

  const idPh = productIds.map(() => '?').join(',');
  // A literal country list (UNION ALL of one row each) so the per-country latest snapshot is
  // found via index seek, not a MAX(...) GROUP BY that scans the whole rankings table.
  const ccUnion = countries.map((_, i) => (i === 0 ? 'SELECT ? AS country' : 'UNION ALL SELECT ?')).join(' ');

  // Read each country's CURRENT snapshot only. A product not present in that snapshot has
  // dropped out of the top 500, so it returns null ("—") instead of a stale last-seen rank.
  // `snap` uses correlated ORDER BY ... LIMIT 1 subqueries (index seek per country) instead of
  // MAX(snapshot_date) GROUP BY country, which used to scan the whole table (~264k rows read).
  const result = await client.execute({
    sql: `WITH snap AS (
      SELECT c.country AS country,
        (SELECT snapshot_date FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS d,
        (SELECT snapshot_hour FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS h
      FROM (${ccUnion}) AS c
    )
    SELECT r.product_id, r.country, r.rank
    FROM snap s
    JOIN rankings r ON r.country = s.country AND r.snapshot_date = s.d AND r.snapshot_hour = s.h
    WHERE r.product_id IN (${idPh})`,
    args: [...countries, ...productIds],
  });

  const out: Record<string, Record<string, number | null>> = {};
  for (const id of productIds) {
    out[id] = Object.fromEntries(countries.map((cc) => [cc, null]));
  }
  for (const row of result.rows) {
    const pid = row.product_id as string;
    const cc = row.country as string;
    if (out[pid]) out[pid][cc] = row.rank as number;
  }
  return out;
}

// A snapshot's real capture minute, from its created_at. snapshot_hour is only the hour bucket, so
// without this the charts label every point at hour:00 — up to an hour earlier than reality.
// Falls back to 0 (the old behaviour) for legacy rows with a missing/unparseable created_at.
function minuteOf(createdAt: string | null): number {
  if (!createdAt) return 0;
  const m = new Date(createdAt).getUTCMinutes();
  return Number.isFinite(m) ? m : 0;
}

export async function getLatestRankingsForProduct(client: Client, productId: string) {
  const result = await client.execute({
    sql: `WITH latest AS (
      SELECT country, MAX(snapshot_date || printf('%02d', snapshot_hour)) AS latest_key
      FROM rankings
      WHERE product_id = ?
      GROUP BY country
    ),
    prev24h AS (
      SELECT country, MAX(snapshot_date || printf('%02d', snapshot_hour)) AS prev_key
      FROM rankings
      WHERE product_id = ?
        AND datetime(snapshot_date || 'T' || printf('%02d', snapshot_hour) || ':00:00')
            <= datetime('now', '-24 hours')
      GROUP BY country
    ),
    best30 AS (
      SELECT country, MIN(rank) AS best_rank
      FROM rankings
      WHERE product_id = ?
        AND snapshot_date >= date('now', '-30 days')
      GROUP BY country
    )
    SELECT
      r.country,
      r.rank AS current_rank,
      r.snapshot_date,
      r.snapshot_hour,
      r.created_at,
      r2.rank AS rank_24h_ago,
      b.best_rank AS best_30d,
      -- is this rank from the country's CURRENT snapshot? Compare the product's latest key for
      -- this country against the country's overall latest, fetched per-country via the index
      -- (ORDER BY ... LIMIT 1 → ~1 row) instead of a whole-table MAX-over-concat scan.
      CASE WHEN l.latest_key = (
             SELECT rc.snapshot_date || printf('%02d', rc.snapshot_hour)
             FROM rankings rc
             WHERE rc.country = l.country
             ORDER BY rc.snapshot_date DESC, rc.snapshot_hour DESC
             LIMIT 1
           ) THEN 1 ELSE 0 END AS is_current
    FROM latest l
    JOIN rankings r ON r.product_id = ? AND r.country = l.country
      AND (r.snapshot_date || printf('%02d', r.snapshot_hour)) = l.latest_key
    LEFT JOIN prev24h p ON p.country = l.country
    LEFT JOIN rankings r2 ON r2.product_id = ? AND r2.country = p.country
      AND (r2.snapshot_date || printf('%02d', r2.snapshot_hour)) = p.prev_key
    LEFT JOIN best30 b ON b.country = l.country
    ORDER BY r.rank ASC`,
    args: [productId, productId, productId, productId, productId],
  });
  return result.rows
    .map((row) => ({
      country: row.country as string,
      current_rank: row.current_rank as number,
      snapshot_date: row.snapshot_date as string,
      snapshot_hour: row.snapshot_hour as number,
      // Real capture minute (the scrape runs near :30, not exactly on the hour). Sent so the chart
      // labels this point at the true time and matches the history rows around it.
      snapshot_minute: minuteOf(row.created_at as string | null),
      rank_24h_ago: row.rank_24h_ago as number | null,
      best_30d: row.best_30d as number | null,
      is_current: (row.is_current as number) === 1, // is this rank from the country's latest snapshot?
    }))
    .filter((r) => r.country in COUNTRY_ORDER) // featured markets only
    .sort((a, b) => COUNTRY_ORDER[a.country] - COUNTRY_ORDER[b.country]); // JP > TH > TW > ID > US
}

export interface LeaderboardSlot {
  id: string;
  name: string;
  country: string;
  rank: number;
}

export interface LeaderboardCreator {
  author: string;
  chart_entries: number;   // total (sticker × country) appearances in the top N
  distinct_stickers: number;
  countries: number;
  best_rank: number;
  by_country: Record<string, number>; // slots held per country, for the breakdown tooltip
  slots: LeaderboardSlot[];           // every (pack × country) appearance, for the packs tooltip
  sample_id: string;       // best-ranked sticker, for a thumbnail
  sample_name: string;
  sample_image: string | null;
}

export interface CreatorLeaderboards {
  all: LeaderboardCreator[];
  jp: LeaderboardCreator[];
  th: LeaderboardCreator[];
  tw: LeaderboardCreator[];
}

// The Top Creators page scopes to LINE's three biggest markets only — beyond these the
// rankings get noisy and distort the "who dominates" picture.
const LEADERBOARD_COUNTRIES = ['jp', 'th', 'tw'] as const;

interface SlotRow {
  country: string;
  rank: number;
  id: string;
  name: string;
  image_url: string | null;
  author: string;
}

// Aggregate already-fetched slot rows into a ranked creator list. "chart_entries" =
// how many sticker×country slots a creator holds in the top N (the headline metric).
function aggregateCreators(rows: SlotRow[], limit: number): LeaderboardCreator[] {
  const byAuthor = new Map<string, LeaderboardCreator & { _stickers: Set<string>; _countries: Set<string> }>();
  for (const row of rows) {
    const { author, rank, id: pid, country: cc } = row;
    let c = byAuthor.get(author);
    if (!c) {
      c = {
        author,
        chart_entries: 0,
        distinct_stickers: 0,
        countries: 0,
        by_country: {},
        slots: [],
        best_rank: rank,
        sample_id: pid,
        sample_name: row.name,
        sample_image: row.image_url ?? null,
        _stickers: new Set(),
        _countries: new Set(),
      };
      byAuthor.set(author, c);
    }
    c.chart_entries += 1;
    c.by_country[cc] = (c.by_country[cc] ?? 0) + 1;
    c.slots.push({ id: pid, name: row.name, country: cc, rank });
    c._stickers.add(pid);
    c._countries.add(cc);
    if (rank < c.best_rank) {
      c.best_rank = rank;
      c.sample_id = pid;
      c.sample_name = row.name;
      c.sample_image = row.image_url ?? null;
    }
  }

  return [...byAuthor.values()]
    .map((c) => {
      c.distinct_stickers = c._stickers.size;
      c.countries = c._countries.size;
      // group by country priority (JP > TH > TW), then best rank within each
      c.slots.sort(
        (a, b) => (COUNTRY_ORDER[a.country] ?? 99) - (COUNTRY_ORDER[b.country] ?? 99) || a.rank - b.rank
      );
      const { _stickers, _countries, ...rest } = c;
      void _stickers; void _countries;
      return rest;
    })
    .sort((a, b) => b.chart_entries - a.chart_entries || a.best_rank - b.best_rank)
    .slice(0, limit);
}

// Creator leaderboards for the three biggest LINE markets (JP, TH, TW): a combined "All"
// board plus one per country, so the page can switch instantly without re-querying.
export async function getCreatorLeaderboards(
  client: Client,
  topN = 100,
  limit = 60
): Promise<CreatorLeaderboards> {
  // Literal country list so each country's latest snapshot is found by index seek, not a
  // MAX(...) GROUP BY that scanned the whole rankings table (~479k rows read — the biggest
  // single read source). Uses each country's OWN latest snapshot (consistent with the
  // dashboard / sticker pages) rather than dropping any country not on the global latest date.
  const ccUnion = LEADERBOARD_COUNTRIES.map((_, i) => (i === 0 ? 'SELECT ? AS country' : 'UNION ALL SELECT ?')).join(' ');
  const result = await client.execute({
    sql: `WITH snap AS (
            SELECT c.country AS country,
              (SELECT snapshot_date FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS d,
              (SELECT snapshot_hour FROM rankings WHERE country = c.country ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1) AS h
            FROM (${ccUnion}) AS c
          )
          SELECT cur.country, cur.rank, p.id, p.name, p.image_url, p.author
          FROM snap s
          JOIN rankings cur ON cur.country = s.country AND cur.snapshot_date = s.d AND cur.snapshot_hour = s.h
          JOIN products p ON p.id = cur.product_id
          WHERE cur.rank <= ?
            AND p.author IS NOT NULL AND TRIM(p.author) != ''`,
    args: [...LEADERBOARD_COUNTRIES, topN],
  });

  const rows: SlotRow[] = result.rows.map((r) => ({
    country: r.country as string,
    rank: r.rank as number,
    id: r.id as string,
    name: r.name as string,
    image_url: (r.image_url as string | null) ?? null,
    author: r.author as string,
  }));

  return {
    all: aggregateCreators(rows, limit),
    jp: aggregateCreators(rows.filter((r) => r.country === 'jp'), limit),
    th: aggregateCreators(rows.filter((r) => r.country === 'th'), limit),
    tw: aggregateCreators(rows.filter((r) => r.country === 'tw'), limit),
  };
}

export async function getRankingHistory(client: Client, productId: string, country: string, days = 30) {
  const result = await client.execute({
    sql: `SELECT snapshot_date, snapshot_hour, rank
          FROM rankings
          WHERE product_id = ? AND country = ?
            AND snapshot_date >= date('now', ? || ' days')
          ORDER BY snapshot_date ASC, snapshot_hour ASC`,
    args: [productId, country, `-${days}`],
  });
  return result.rows.map((row) => ({
    snapshot_date: row.snapshot_date as string,
    snapshot_hour: row.snapshot_hour as number,
    rank: row.rank as number,
  }));
}

// All-country 30-day history for one product in a single PK-indexed read (product_id is the
// PRIMARY KEY prefix, so this touches only that product's rows — cheap). The sticker page
// fetches this ONCE server-side (ISR-cached), letting the client render the all-country chart
// and filter to a single country with zero extra DB reads.
export async function getRankingHistoryAll(client: Client, productId: string, days = 30) {
  const result = await client.execute({
    // created_at is the moment the snapshot was actually captured; snapshot_hour is only the hour
    // bucket. Selecting it costs no extra reads (same rows), and we ship only its MINUTE (a small
    // int) to the client so the chart can label points at the real capture time (e.g. 20:30, not
    // 20:00) without bloating the payload with full timestamps.
    sql: `SELECT country, snapshot_date, snapshot_hour, rank, created_at
          FROM rankings
          WHERE product_id = ? AND snapshot_date >= date('now', ? || ' days')
          ORDER BY country ASC, snapshot_date ASC, snapshot_hour ASC`,
    args: [productId, `-${days}`],
  });
  return result.rows.map((row) => ({
    country: row.country as string,
    snapshot_date: row.snapshot_date as string,
    snapshot_hour: row.snapshot_hour as number,
    snapshot_minute: minuteOf(row.created_at as string | null),
    rank: row.rank as number,
  }));
}
