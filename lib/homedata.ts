import type { Client } from '@libsql/client';
import { COUNTRY_MAP } from '@/lib/countries';

// Shared homepage data queries, used by BOTH the server-rendered homepage (app/page.tsx, so AI
// crawlers and no-JS clients see real rankings in the initial HTML) and the /api/dashboard +
// /api/trending route handlers. Keeping ONE implementation means one set of index-driven queries,
// and the homepage's ISR cache + the route caches don't drift.

const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

// Days of rank history for each Top-5 sticker's homepage sparkline. Short + folded into the caches
// so reads stay bounded: history is a PK-indexed per-product seek (product_id is the rankings
// PRIMARY KEY prefix), so each sticker touches only its own rows.
const SPARK_DAYS = 7;

// Only derive rank-movement deltas from two snapshots if they're close in time. Guards against a
// misleading ▲/▼ that actually spans a delayed scrape or the old daily→new hourly transition.
const MAX_GAP_HOURS = 3;

function snapTime(date: string, hour: number) {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
}

export interface Top5Item {
  rank: number;
  id: string;
  name: string;
  image_url: string;
  delta: number | null;
  isNew: boolean;
  spark: number[];
}

export interface DashboardCountry {
  code: string;
  name: string;
  flag: string;
  top5: Top5Item[];
}

export interface DashboardData {
  date: string | null;
  updatedAt: string | null;
  countries: DashboardCountry[];
}

// Collapse a product's hourly history to one rank per day (the last hour of each day), oldest→
// newest, so the sparkline shows a clean daily trend line.
function dailySpark(rows?: { d: string; h: number; rank: number }[]): number[] {
  if (!rows || rows.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.d, r.rank); // rows ordered by date,hour asc → last write per day wins
  return [...byDay.keys()].sort().map((d) => byDay.get(d)!);
}

export async function getDashboardData(client: Client): Promise<DashboardData> {
  // For the "Updated …" label only: newest snapshot's date + a created_at from it. Reverse-scan
  // via idx_rankings_date_hour, LIMIT 1 → ~1 row (not MAX(created_at), which would full-scan).
  const latestResult = await client.execute(
    `SELECT snapshot_date, created_at as updated_at FROM rankings ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`
  );
  const latestRow = latestResult.rows[0];
  if (!latestRow?.snapshot_date) return { date: null, updatedAt: null, countries: [] };
  const date = latestRow.snapshot_date as string;
  const updatedAt = latestRow.updated_at as string;

  const countryData = (
    await Promise.all(
      FEATURED_COUNTRIES.map(async (code) => {
        const info = COUNTRY_MAP[code];

        // Two most recent distinct snapshots for this country: latest drives the Top-5, previous
        // gives each row its rank-movement delta. Both index seeks.
        const snaps = await client.execute({
          sql: `SELECT DISTINCT snapshot_date, snapshot_hour
                FROM rankings WHERE country = ?
                ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 2`,
          args: [code],
        });
        const cur = snaps.rows[0];
        if (!cur) return { ...info, top5: [] as Top5Item[] };
        let prev: (typeof snaps.rows)[number] | null = snaps.rows[1] ?? null;
        if (prev) {
          const gapHours =
            (snapTime(cur.snapshot_date as string, cur.snapshot_hour as number) -
              snapTime(prev.snapshot_date as string, prev.snapshot_hour as number)) /
            3_600_000;
          if (gapHours > MAX_GAP_HOURS) prev = null;
        }
        const hasPrev = prev !== null;

        // Top-5 of the latest snapshot + each product's rank in the previous snapshot (LEFT JOIN so
        // a brand-new entry still returns, old_rank NULL). WHERE uses idx_rankings_country_date_hour;
        // the join is a PK seek per row → bounded to 5 rows.
        const top5Result = await client.execute({
          sql: `SELECT r.rank, p.id, p.name, p.image_url, o.rank AS old_rank
                FROM rankings r
                JOIN products p ON p.id = r.product_id
                LEFT JOIN rankings o
                  ON o.product_id = r.product_id AND o.country = r.country
                  AND o.snapshot_date = ? AND o.snapshot_hour = ?
                WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ?
                ORDER BY r.rank ASC
                LIMIT 5`,
          args: [
            prev ? prev.snapshot_date : null,
            prev ? prev.snapshot_hour : null,
            code,
            cur.snapshot_date,
            cur.snapshot_hour,
          ],
        });

        const ids = top5Result.rows.map((r) => r.id as string);

        // 7-day rank history for exactly those Top-5 stickers (PK seeks, no table scan).
        const sparkByProduct = new Map<string, { d: string; h: number; rank: number }[]>();
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const histResult = await client.execute({
            sql: `SELECT product_id, snapshot_date, snapshot_hour, rank
                  FROM rankings
                  WHERE product_id IN (${placeholders})
                    AND country = ?
                    AND snapshot_date >= date('now', ? || ' days')
                  ORDER BY product_id ASC, snapshot_date ASC, snapshot_hour ASC`,
            args: [...ids, code, `-${SPARK_DAYS}`],
          });
          for (const row of histResult.rows) {
            const pid = row.product_id as string;
            const arr = sparkByProduct.get(pid) ?? [];
            arr.push({ d: row.snapshot_date as string, h: row.snapshot_hour as number, rank: row.rank as number });
            sparkByProduct.set(pid, arr);
          }
        }

        const top5: Top5Item[] = top5Result.rows.map((row) => {
          const id = row.id as string;
          const rank = row.rank as number;
          const oldRank = row.old_rank == null ? null : (row.old_rank as number);
          const delta = oldRank == null ? null : oldRank - rank;
          const isNew = hasPrev && oldRank == null;
          return {
            rank,
            id,
            name: row.name as string,
            image_url: row.image_url as string,
            delta,
            isNew,
            spark: dailySpark(sparkByProduct.get(id)),
          };
        });

        return { ...info, top5 };
      })
    )
  ).filter((c) => c.top5.length > 0);

  return { date, updatedAt, countries: countryData };
}

export interface TrendItem {
  id: string;
  name: string;
  image_url: string;
  current_rank: number;
  old_rank: number;
  improvement: number;
}

export interface TrendingCountry {
  code: string;
  name: string;
  flag: string;
  trending: TrendItem[];
  from: number | null;
  to: number | null;
}

export async function getTrendingData(client: Client): Promise<{ countries: TrendingCountry[] }> {
  const countries = await Promise.all(
    FEATURED_COUNTRIES.map(async (code) => {
      const info = COUNTRY_MAP[code];

      const snaps = await client.execute({
        sql: `SELECT DISTINCT snapshot_date, snapshot_hour
              FROM rankings WHERE country = ?
              ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 2`,
        args: [code],
      });
      if (snaps.rows.length < 2) return { ...info, code, trending: [], from: null, to: null };

      const cur = snaps.rows[0];
      const prev = snaps.rows[1];
      const gapHours =
        (snapTime(cur.snapshot_date as string, cur.snapshot_hour as number) -
          snapTime(prev.snapshot_date as string, prev.snapshot_hour as number)) /
        3_600_000;
      if (gapHours > MAX_GAP_HOURS) return { ...info, code, trending: [], from: null, to: null };

      const trendResult = await client.execute({
        sql: `SELECT p.id, p.name, p.image_url,
                     newr.rank AS current_rank,
                     oldr.rank AS old_rank,
                     (oldr.rank - newr.rank) AS improvement
              FROM rankings newr
              JOIN rankings oldr
                ON oldr.product_id = newr.product_id AND oldr.country = newr.country
                AND oldr.snapshot_date = ? AND oldr.snapshot_hour = ?
              JOIN products p ON p.id = newr.product_id
              WHERE newr.country = ? AND newr.snapshot_date = ? AND newr.snapshot_hour = ?
                AND oldr.rank > newr.rank
              ORDER BY improvement DESC LIMIT 5`,
        args: [prev.snapshot_date, prev.snapshot_hour, code, cur.snapshot_date, cur.snapshot_hour],
      });

      const trending = trendResult.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        image_url: row.image_url as string,
        current_rank: row.current_rank as number,
        old_rank: row.old_rank as number,
        improvement: row.improvement as number,
      }));

      return {
        ...info,
        code,
        trending,
        from: snapTime(prev.snapshot_date as string, prev.snapshot_hour as number),
        to: snapTime(cur.snapshot_date as string, cur.snapshot_hour as number),
      };
    })
  );

  return { countries: countries.filter((c) => c.trending.length > 0) };
}
