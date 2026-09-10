import { NextResponse } from 'next/server';
import { getDb, getGlobalStickerRanking } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY = { asOf: null, countries: [], packs: [], totalPacks: 0, characterTravel: [] };

/** Strict YYYY-MM-DD that is also a real calendar day (rejects 2026-02-30, 2026-13-01, …). */
function validDate(v: string | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
}

/** Today in Bangkok — the clock the site presents everywhere else. */
function todayBangkok(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Combined ranking for /top-stickers: the Refresh button (no params) and the date picker (?date=).
//
// Cost, because this route is public and the free Turso plan has bitten this site before: one call
// is the same index-seek query the page runs — the top 500 of each market for one snapshot plus a
// primary-key seek per distinct pack, ~2,900 rows. A bogus or empty date costs only three index
// probes because the join then matches nothing.
//
// The real protection is the cache header. A PAST day can never change, so its response is cached
// at the CDN for a week and repeat views of the same day cost zero reads — which is what makes
// browsing back through 100+ days safe. Today's ranking still moves every hour, so it is never
// cached: the Refresh button must always hit the database, that is its whole purpose.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('date');
  const date = validDate(raw);
  if (raw && !date) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD', data: EMPTY }, { status: 400 });
  }

  try {
    const data = await getGlobalStickerRanking(getDb(), 100, date);
    const res = NextResponse.json({ data });
    // Only a day strictly in the past is immutable; "today" is still being written to hourly.
    if (date && date < todayBangkok()) {
      res.headers.set('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    }
    return res;
  } catch {
    // DB unreadable (e.g. read quota) — 200 with an empty payload so the page shows its own
    // "nothing for that day" state instead of a failed fetch.
    return NextResponse.json({ data: EMPTY }, { status: 200 });
  }
}
