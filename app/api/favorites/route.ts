import { NextRequest, NextResponse } from 'next/server';
import { getDb, getProductsWithRankings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'];

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').filter(Boolean).slice(0, 50);
  if (!ids.length) return NextResponse.json({ products: [] });

  const client = getDb();

  const idPh = ids.map(() => '?').join(',');
  const result = await client.execute({
    sql: `SELECT id, name, image_url, author, sticker_type FROM products WHERE id IN (${idPh})`,
    args: ids,
  });

  const products = result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    image_url: row.image_url as string | null,
    author: row.author as string | null,
    sticker_type: row.sticker_type as string | null,
  }));

  const rankings = await getProductsWithRankings(client, ids, FEATURED);

  const withRankings = products.map((p) => ({
    ...p,
    rankings: rankings[p.id] ?? Object.fromEntries(FEATURED.map((cc) => [cc, null])),
  }));

  return NextResponse.json({ products: withRankings });
}
