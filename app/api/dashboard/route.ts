import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

// Top LINE-using countries ordered by MAU (Japan ~96M, Thailand ~54M, Taiwan ~23M, Indonesia ~20M, US ~3M)
const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

export const runtime = 'nodejs';
// Cache for 10 min instead of force-dynamic. The homepage calls this on every load; caching
// keeps crawler traffic from re-querying the DB each time. Hourly data tolerates ~10 min
// staleness; the only cost is the "Updated …" label lagging slightly at a low-traffic moment.
export const revalidate = 600;

export async function GET() {
  try {
    const client = getDb();

    // For the "Updated …" label only: snapshot_date + created_at of the most recently written row.
    const latestResult = await client.execute(
      `SELECT snapshot_date, MAX(created_at) as updated_at FROM rankings`
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
          const top5Result = await client.execute({
            sql: `WITH s AS (
                    SELECT snapshot_date AS d, MAX(snapshot_hour) AS h
                    FROM rankings
                    WHERE country = ? AND snapshot_date = (SELECT MAX(snapshot_date) FROM rankings WHERE country = ?)
                  )
                  SELECT r.rank, p.id, p.name, p.image_url
                  FROM rankings r
                  JOIN s ON r.snapshot_date = s.d AND r.snapshot_hour = s.h
                  JOIN products p ON p.id = r.product_id
                  WHERE r.country = ?
                  ORDER BY r.rank ASC
                  LIMIT 5`,
            args: [code, code, code],
          });
          const top5 = top5Result.rows.map((row) => ({
            rank: row.rank as number,
            id: row.id as string,
            name: row.name as string,
            image_url: row.image_url as string,
          }));
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
