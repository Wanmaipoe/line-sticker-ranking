import { NextRequest, NextResponse } from 'next/server';
import { getDb, searchAuthors } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.length < 1) return NextResponse.json({ results: [] });

  const client = getDb();
  const results = await searchAuthors(client, q, 10);
  return NextResponse.json({ results });
}
