import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

// Top LINE-using countries ordered by MAU (Japan ~96M, Thailand ~54M, Taiwan ~23M, Indonesia ~20M, US ~3M)
const FEATURED_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET() {
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
}
