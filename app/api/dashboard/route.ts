import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

// Top LINE-using countries ordered by MAU (Japan ~96M, Thailand ~54M, Taiwan ~23M, Indonesia ~20M, US ~3M)
const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

// Days of rank history to include for each Top-5 sticker's homepage sparkline. Kept short (and
// folded into this 10-min-cached route) so the extra reads are bounded: history is a PK-indexed
// per-product seek (product_id is the rankings PRIMARY KEY prefix), so each sticker touches only
// its own rows. 7 days is enough to read a trend without paying for a month of hourly rows.
const SPARK_DAYS = 7;

// Only derive rank-movement deltas from two snapshots if they're close in time (mirrors
// /api/trending). Guards against showing a misleading ▲/▼ that actually spans a delayed scrape
// or the old daily→new hourly transition rather than "since the last update".
const MAX_GAP_HOURS = 3;

function snapTime(date: string, hour: number) {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
}

export const runtime = 'nodejs';
// Cache for 10 min instead of force-dynamic. The homepage calls this on every load; caching
// keeps crawler traffic from re-querying the DB each time. Hourly data tolerates ~10 min
// staleness; the only cost is the "Updated …" label lagging slightly at a low-traffic moment.
export const revalidate = 600;

export async function GET() {
  try {
    const client = getDb();

    // For the "Updated …" label only: newest snapshot's date + a created_at from it. Uses
    // idx_rankings_date_hour (reverse scan, LIMIT 1 → ~1 row) instead of MAX(created_at), which
    // has no index and would full-scan the whole table on every 10-min regeneration.
    const latestResult = await client.execute(
      `SELECT snapshot_date, created_at as updated_at FROM rankings ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`
    );
    const latestRow = latestResult.rows[0];
    if (!latestRow?.snapshot_date) {
      return NextResponse.json({ date: null, updatedAt: null, countries: [] });
    }
    const date = latestRow.snapshot_date as string;
    const updatedAt = latestRow.updated_at as string;

    // Top 5 per country, each from THAT country's OWN latest snapshot. The scraper stamps a
    // per-country snapshot key (a country can be a date/hour behind the others), so forcing one
    // global (date,hour) onto every country silently dropped whichever one was a step behind
    // (e.g. US at hour 15 while the rest were at hour 16). Mirrors the /country page pattern.
    const countryData = (
      await Promise.all(
        FEATURED_COUNTRIES.map(async (code) => {
          const info = COUNTRY_MAP[code];

          // The two most recent distinct snapshots for this country: the latest drives the Top-5,
          // the previous one gives each row its rank-movement delta (▲/▼/NEW). Both index seeks.
          const snaps = await client.execute({
            sql: `SELECT DISTINCT snapshot_date, snapshot_hour
                  FROM rankings WHERE country = ?
                  ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 2`,
            args: [code],
          });
          const cur = snaps.rows[0];
          if (!cur) return { ...info, top5: [] as Top5Item[] };
          let prev: (typeof snaps.rows)[number] | null = snaps.rows[1] ?? null;
          // Drop the previous snapshot if it's too far back to be "the last update" — otherwise
          // the delta chips would report movement across a many-hour gap.
          if (prev) {
            const gapHours =
              (snapTime(cur.snapshot_date as string, cur.snapshot_hour as number) -
                snapTime(prev.snapshot_date as string, prev.snapshot_hour as number)) /
              3_600_000;
            if (gapHours > MAX_GAP_HOURS) prev = null;
          }
          const hasPrev = prev !== null;

          // Top-5 of the latest snapshot + each product's rank in the previous snapshot (LEFT JOIN
          // so a brand-new entry still returns, with old_rank = NULL). WHERE uses
          // idx_rankings_country_date_hour; the join is a PK seek per row → bounded to 5 rows.
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

          // 7-day rank history for exactly those Top-5 stickers, for the inline sparkline. The IN
          // list is at most 5 product_ids and product_id is the PRIMARY KEY prefix, so SQLite does
          // 5 PK seeks (no table scan). Downsampled to one point per day (last rank of the day) in
          // JS below to keep the payload tiny.
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
              arr.push({
                d: row.snapshot_date as string,
                h: row.snapshot_hour as number,
                rank: row.rank as number,
              });
              sparkByProduct.set(pid, arr);
            }
          }

          const top5: Top5Item[] = top5Result.rows.map((row) => {
            const id = row.id as string;
            const rank = row.rank as number;
            const oldRank = row.old_rank == null ? null : (row.old_rank as number);
            // delta = how many places it moved up (positive) since the previous snapshot.
            const delta = oldRank == null ? null : oldRank - rank;
            // New entry only if we actually HAVE a previous snapshot to have been absent from.
            const isNew = hasPrev && oldRank == null;
            return { rank, id, name: row.name as string, image_url: row.image_url as string, delta, isNew, spark: dailySpark(sparkByProduct.get(id)) };
          });

          return { ...info, top5 };
        })
      )
    ).filter((c) => c.top5.length > 0);

    return NextResponse.json({ date, updatedAt, countries: countryData });
  } catch {
    // DB unreadable (e.g. Turso read quota hit) — return an empty payload with HTTP 200 so the
    // homepage shows its "No data yet" state instead of a 500 that Google logs as a crawl error.
    return NextResponse.json({ date: null, updatedAt: null, countries: [] });
  }
}

type Top5Item = {
  rank: number;
  id: string;
  name: string;
  image_url: string;
  delta: number | null;
  isNew: boolean;
  spark: number[];
};

// Collapse a product's hourly history to one rank per day (the last/most-recent hour of each day),
// oldest→newest, so the sparkline shows a clean daily trend line instead of a jagged hourly one.
function dailySpark(rows?: { d: string; h: number; rank: number }[]): number[] {
  if (!rows || rows.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.d, r.rank); // rows are ordered by date,hour asc → last write per day wins
  return [...byDay.keys()].sort().map((d) => byDay.get(d)!);
}
