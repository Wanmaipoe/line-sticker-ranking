import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getDailyChampions, DAILY_CHAMPION_DAYS } from '@/lib/champions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live daily-winner history for the Daily #1 page's Refresh button. The page itself is ISR-cached
// (up to ~30 min behind the hourly scrape); this lets a visitor pull today's standing on demand.
//
// Cost: the same two queries the page runs. The first is served entirely by the partial index
// idx_rankings_rank1, which holds ONLY rank-1 rows — 3 per hour site-wide — so a 62-day window is
// ~4.5k index rows rather than the ~1.3M the general country/date index would have to scan. The
// second is a PK seek per distinct winning pack (~180 rows). Reads happen only on an explicit
// click, never in the background, and the button is disabled while a request is in flight so one
// intent costs one query.
export async function GET() {
  try {
    const data = await getDailyChampions(getDb(), undefined, DAILY_CHAMPION_DAYS);
    return NextResponse.json({ data });
  } catch {
    // DB unreadable (e.g. Turso read quota) — 200 with an empty payload, which the client treats
    // as "keep what you already have" rather than blanking a working page.
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
