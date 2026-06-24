import { createClient, type Client } from '@libsql/client';
import { FEATURED_COUNTRIES, COUNTRY_ORDER } from './countries';

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
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
  const ccPh = countries.map(() => '?').join(',');

  const result = await client.execute({
    sql: `WITH latest_date AS (
      SELECT product_id, country, MAX(snapshot_date) AS max_date
      FROM rankings
      WHERE product_id IN (${idPh}) AND country IN (${ccPh})
      GROUP BY product_id, country
    ),
    latest_hour AS (
      SELECT r.product_id, r.country, MAX(r.snapshot_hour) AS max_hour
      FROM rankings r
      JOIN latest_date l ON r.product_id = l.product_id AND r.country = l.country AND r.snapshot_date = l.max_date
      GROUP BY r.product_id, r.country
    )
    SELECT r.product_id, r.country, r.rank
    FROM rankings r
    JOIN latest_date ld ON r.product_id = ld.product_id AND r.country = ld.country AND r.snapshot_date = ld.max_date
    JOIN latest_hour lh ON r.product_id = lh.product_id AND r.country = lh.country AND r.snapshot_hour = lh.max_hour`,
    args: [...productIds, ...countries],
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
      r2.rank AS rank_24h_ago,
      b.best_rank AS best_30d
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
      rank_24h_ago: row.rank_24h_ago as number | null,
      best_30d: row.best_30d as number | null,
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

// Which creators dominate the charts right now, aggregated across all 5 tracked markets'
// latest snapshot. "chart_entries" = how many sticker×country slots they hold in the
// top N — the headline metric. This is something the daily-only competitor can't frame.
export async function getCreatorLeaderboard(
  client: Client,
  topN = 100,
  limit = 60
): Promise<LeaderboardCreator[]> {
  const result = await client.execute({
    sql: `WITH global_latest AS (
            SELECT MAX(snapshot_date) AS gd FROM rankings
          ),
          latest_date AS (
            -- only countries still actively scraped today; excludes stale country codes
            -- left over from the old data source whose latest snapshot is an older date
            SELECT country, MAX(snapshot_date) AS d
            FROM rankings GROUP BY country
            HAVING MAX(snapshot_date) = (SELECT gd FROM global_latest)
          ),
          snap AS (
            SELECT r.country, r.snapshot_date AS d, MAX(r.snapshot_hour) AS h
            FROM rankings r
            JOIN latest_date l ON r.country = l.country AND r.snapshot_date = l.d
            GROUP BY r.country
          )
          SELECT cur.country, cur.rank, p.id, p.name, p.image_url, p.author
          FROM rankings cur
          JOIN snap s ON cur.country = s.country AND cur.snapshot_date = s.d AND cur.snapshot_hour = s.h
          JOIN products p ON p.id = cur.product_id
          WHERE cur.rank <= ?
            AND cur.country IN (${FEATURED_COUNTRIES.map(() => '?').join(',')})
            AND p.author IS NOT NULL AND TRIM(p.author) != ''`,
    args: [topN, ...FEATURED_COUNTRIES],
  });

  const byAuthor = new Map<string, LeaderboardCreator & { _stickers: Set<string>; _countries: Set<string> }>();
  for (const row of result.rows) {
    const author = row.author as string;
    const rank = row.rank as number;
    const pid = row.id as string;
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
        sample_name: row.name as string,
        sample_image: (row.image_url as string | null) ?? null,
        _stickers: new Set(),
        _countries: new Set(),
      };
      byAuthor.set(author, c);
    }
    const cc = row.country as string;
    c.chart_entries += 1;
    c.by_country[cc] = (c.by_country[cc] ?? 0) + 1;
    c.slots.push({ id: pid, name: row.name as string, country: cc, rank });
    c._stickers.add(pid);
    c._countries.add(cc);
    if (rank < c.best_rank) {
      c.best_rank = rank;
      c.sample_id = pid;
      c.sample_name = row.name as string;
      c.sample_image = (row.image_url as string | null) ?? null;
    }
  }

  return [...byAuthor.values()]
    .map((c) => {
      c.distinct_stickers = c._stickers.size;
      c.countries = c._countries.size;
      c.slots.sort((a, b) => a.rank - b.rank); // best rank first
      const { _stickers, _countries, ...rest } = c;
      void _stickers; void _countries;
      return rest;
    })
    .sort((a, b) => b.chart_entries - a.chart_entries || a.best_rank - b.best_rank)
    .slice(0, limit);
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
