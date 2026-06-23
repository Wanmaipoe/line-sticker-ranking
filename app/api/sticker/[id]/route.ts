import { NextRequest, NextResponse } from 'next/server';
import { getDb, getLatestRankingsForProduct } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getDb();
  const rankings = await getLatestRankingsForProduct(client, id);
  return NextResponse.json({ rankings });
}
