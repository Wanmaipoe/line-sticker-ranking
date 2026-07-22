import { NextResponse } from 'next/server';
import { getDb, getCategoryRankings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live category rankings for the /categories Refresh button. The page is ISR-cached (up to ~30 min
// stale); this pulls the current snapshot on demand. Reads only fire on an explicit click — the same
// index-driven top-500-per-country query the page uses (~1,500 rows), never in the background.
export async function GET() {
  try {
    const data = await getCategoryRankings(getDb(), ['jp', 'th', 'tw']);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
