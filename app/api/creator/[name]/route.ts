import { NextRequest, NextResponse } from 'next/server';
import { getDb, getProductsByAuthor, getProductsWithRankings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const author = decodeURIComponent(name);
  const client = getDb();

  const products = await getProductsByAuthor(client, author);
  const ids = products.map((p) => p.id);
  const rankings = await getProductsWithRankings(client, ids, FEATURED);

  const withRankings = products.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    author: p.author,
    rankings: rankings[p.id] ?? Object.fromEntries(FEATURED.map((cc) => [cc, null])),
  }));

  return NextResponse.json({ author, products: withRankings });
}
