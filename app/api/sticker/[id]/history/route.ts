import { NextRequest, NextResponse } from 'next/server';
import { getDb, getRankingHistory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const country = req.nextUrl.searchParams.get('country') ?? 'th';
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);

  const client = getDb();
  const history = await getRankingHistory(client, id, country, days);
  return NextResponse.json({ history });
}
