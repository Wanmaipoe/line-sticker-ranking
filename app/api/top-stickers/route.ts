import { NextResponse } from 'next/server';
import { getDb, getGlobalStickerRanking } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live combined ranking for the Top Stickers page's Refresh button. The page itself is ISR-cached
// (up to ~30 min behind the hourly scrape); this lets a visitor pull the current standings on
// demand. Reads only happen on an explicit click — the same single index-seek query the page uses
// (~1500 rows: the current top 500 of each market), never in the background.
export async function GET() {
  try {
    const data = await getGlobalStickerRanking(getDb(), 100);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { data: { asOf: null, countries: [], packs: [], totalPacks: 0, characterTravel: [] } },
      { status: 200 }
    );
  }
}
