import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

// Top LINE-using countries ordered by MAU (Japan ~96M, Thailand ~54M, Taiwan ~23M, Indonesia ~20M, US ~3M)
const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

export const runtime = 'nodejs';
// Cache for 10 min instead of force-dynamic. The homepage calls this on every load, and each
// call runs a "latest snapshot" scan plus 5 per-country queries — under crawler traffic that
// was a major source of DB row-reads. Hourly data tolerates ~10 min staleness; the only cost
// is the "Updated …" label lagging slightly at a very low-traffic moment.
export const revalidate = 600;

export async function GET() {
  try {
    const client = getDb();

    const latestResult = await client.execute(
      `SELECT snapshot_date, snapshot_hour, MAX(created_at) as updated_at FROM rankings ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`
    );

    const latestRow = latestResult.rows[0];
    if (!latestRow) {
      return NextResponse.json({ date: null, updatedAt: null, countries: [] });
    }

    const date = latestRow.snapshot_date as string;
    const hour = latestRow.snapshot_hour as number;
    const updatedAt = latestRow.updated_at as string;

    const countryData = (
      await Promise.all(
        FEATURED_COUNTRIES.map(async (code) => {
          const info = COUNTRY_MAP[code];
          const top5Result = await client.execute({
            sql: `SELECT r.rank, p.id, p.name, p.image_url
                  FROM rankings r
                  JOIN products p ON p.id = r.product_id
                  WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ?
                  ORDER BY r.rank ASC
                  LIMIT 5`,
            args: [code, date, hour],
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
