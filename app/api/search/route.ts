import { NextRequest, NextResponse } from 'next/server';
import { getDb, searchProducts } from '@/lib/db';
import { searchStickers } from '@/lib/linesticker-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const client = getDb();

  const local = await searchProducts(client, q, 20);

  if (local.length >= 5) {
    return NextResponse.json({ results: local, source: 'local' });
  }

  try {
    const remote = await searchStickers(q, 20);
    const localIds = new Set(local.map((p) => p.id));
    const merged = [
      ...local,
      ...remote
        .filter((r) => !localIds.has(r.sticker_id))
        .map((r) => ({
          id: r.sticker_id,
          name: r.title,
          image_url: r.image_url,
          updated_at: new Date().toISOString(),
        })),
    ].slice(0, 20);

    return NextResponse.json({ results: merged, source: 'merged' });
  } catch {
    return NextResponse.json({ results: local, source: 'local-only' });
  }
}
