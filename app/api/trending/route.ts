import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

// Only compare two snapshots if they're close in time. This both defines "movers
// since the last update" and guards against comparing across the old daily source
// and the new hourly one during the transition (that gap is larger than this window).
const MAX_GAP_HOURS = 3;

export const runtime = 'nodejs';
export const revalidate = 300;

function snapTime(date: string, hour: number) {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
}

export async function GET() {
  const client = getDb();

  const countries = await Promise.all(
    FEATURED_COUNTRIES.map(async (code) => {
      const info = COUNTRY_MAP[code];

      // the two most recent distinct snapshots for this country
      const snaps = await client.execute({
        sql: `SELECT DISTINCT snapshot_date, snapshot_hour
              FROM rankings WHERE country = ?
              ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 2`,
        args: [code],
      });
      if (snaps.rows.length < 2) return { ...info, code, trending: [], from: null, to: null };

      const cur = snaps.rows[0];
      const prev = snaps.rows[1];
      const gapHours = (snapTime(cur.snapshot_date as string, cur.snapshot_hour as number) -
        snapTime(prev.snapshot_date as string, prev.snapshot_hour as number)) / 3_600_000;
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
        args: [
          prev.snapshot_date, prev.snapshot_hour,
          code, cur.snapshot_date, cur.snapshot_hour,
        ],
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

  const withData = countries.filter((c) => c.trending.length > 0);
  return NextResponse.json({ countries: withData });
}
