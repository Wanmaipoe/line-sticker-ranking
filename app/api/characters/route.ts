import { NextResponse } from 'next/server';
import { getDb, getCharacterRankings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live character rankings for the /characters Refresh button and the post-edit re-sync. Each call is
// a ~1,500-row Turso read, so — unlike the ISR page — a public unauthenticated route like this can be
// looped to burn the read quota (a demonstrated site-outage cause). A short edge cache absorbs rapid
// repeats: rankings change hourly, so 60s of staleness is invisible to a human clicking Refresh, but
// it caps an attacker to ~1 uncached read/min. Errors are left uncached so they retry immediately.
export async function GET() {
  try {
    const data = await getCharacterRankings(getDb(), ['jp', 'th', 'tw']);
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=1800' } }
    );
  } catch {
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
