import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET() {
  const client = getDb();

  const datesResult = await client.execute(
    `SELECT DISTINCT snapshot_date FROM rankings ORDER BY snapshot_date DESC LIMIT 4`
  );

  if (datesResult.rows.length < 2) {
    return NextResponse.json({ countries: [] });
  }

  const latestDate = datesResult.rows[0].snapshot_date as string;
  const oldDate = datesResult.rows[Math.min(3, datesResult.rows.length - 1)].snapshot_date as string;

  const countryData = (
    await Promise.all(
      FEATURED_COUNTRIES.map(async (code) => {
        const info = COUNTRY_MAP[code];
        const trendResult = await client.execute({
          sql: `SELECT
                  p.id,
                  p.name,
                  p.image_url,
                  new.rank AS current_rank,
                  old.rank AS old_rank,
                  (old.rank - new.rank) AS improvement
                FROM rankings new
                JOIN rankings old
                  ON old.product_id = new.product_id
                  AND old.country = new.country
                  AND old.snapshot_date = ?
                JOIN products p ON p.id = new.product_id
                WHERE new.country = ?
                  AND new.snapshot_date = ?
                  AND old.rank > new.rank
                ORDER BY improvement DESC
                LIMIT 5`,
          args: [oldDate, code, latestDate],
        });
        const trending = trendResult.rows.map((row) => ({
          id: row.id as string,
          name: row.name as string,
          image_url: row.image_url as string,
          current_rank: row.current_rank as number,
          old_rank: row.old_rank as number,
          improvement: row.improvement as number,
        }));
        return { ...info, trending };
      })
    )
  ).filter((c) => c.trending.length > 0);

  return NextResponse.json({ countries: countryData, latestDate, oldDate });
}
