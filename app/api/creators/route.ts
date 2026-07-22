import { NextResponse } from 'next/server';
import { getDb, getCreatorLeaderboards } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live leaderboards for the Top Creators page's Refresh button. The page itself is ISR-cached
// (up to ~30 min behind the hourly scrape); this lets a visitor pull the current standings on
// demand. Reads only happen on an explicit click — the same top-100-per-country index seek the
// page uses (~300 rows), never in the background.
export async function GET() {
  try {
    const boards = await getCreatorLeaderboards(getDb(), 100, 60);
    return NextResponse.json({ boards });
  } catch {
    return NextResponse.json({ boards: { all: [], jp: [], th: [], tw: [] } }, { status: 200 });
  }
}
