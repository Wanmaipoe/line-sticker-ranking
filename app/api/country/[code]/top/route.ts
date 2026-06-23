import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cc = code.toLowerCase();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 100);
  const client = getDb();

  const dateRes = await client.execute({
    sql: `SELECT MAX(snapshot_date) AS latest FROM rankings WHERE country = ?`,
    args: [cc],
  });
  const latestDate = dateRes.rows[0]?.latest as string | null;

  if (!latestDate) {
    return NextResponse.json({ code: cc, date: null, items: [] });
  }

  const result = await client.execute({
    sql: `SELECT r.rank, p.id, p.name, p.image_url, p.author
          FROM rankings r
          JOIN products p ON p.id = r.product_id
          WHERE r.country = ? AND r.snapshot_date = ?
          ORDER BY r.rank ASC
          LIMIT ?`,
    args: [cc, latestDate, limit],
  });

  const info = COUNTRY_MAP[cc];

  return NextResponse.json({
    code: cc,
    name: info?.name ?? cc.toUpperCase(),
    flag: info?.flag ?? '🌏',
    date: latestDate,
    items: result.rows.map((row) => ({
      rank: row.rank as number,
      id: row.id as string,
      name: row.name as string,
      image_url: row.image_url as string | null,
      author: row.author as string | null,
    })),
  });
}
