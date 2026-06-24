import { createClient, type Client } from '@libsql/client';

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
  return result.rows.map((row) => ({
    country: row.country as string,
    current_rank: row.current_rank as number,
    snapshot_date: row.snapshot_date as string,
    snapshot_hour: row.snapshot_hour as number,
    rank_24h_ago: row.rank_24h_ago as number | null,
    best_30d: row.best_30d as number | null,
  }));
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
