import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COUNTRY_MAP, isFeaturedCountry } from '@/lib/countries';
import { ARCHIVED_DAY_CACHE_CONTROL, isArchivedDay, validDate } from '@/lib/day';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cc = code.toLowerCase();
  // Mirror the HTML route's guard. Without it this happily queried ANY string, so a retired market
  // kept serving its final frozen snapshot forever (the query takes MAX(snapshot_date), not a
  // recent date), and arbitrary junk codes reached the database.
  if (!isFeaturedCountry(cc)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 100);
  // Same validator /api/top-stickers uses, so the two date pickers reject exactly the same strings.
  const rawDate = req.nextUrl.searchParams.get('date');
  const date = validDate(rawDate);
  if (rawDate && !date) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const client = getDb();

  // Two shapes of the same seek on idx_rankings_country_date_hour. Without a date: the market's
  // newest snapshot. With one: that day's LAST hour — the day's closing standing, and the only hour
  // guaranteed to exist on a day the scraper covered only partially.
  const dateRes = date
    ? await client.execute({
        sql: `SELECT MAX(snapshot_hour) AS latest_hour FROM rankings WHERE country = ? AND snapshot_date = ?`,
        args: [cc, date],
      })
    : await client.execute({
        sql: `SELECT MAX(snapshot_date) AS latest, MAX(snapshot_hour) AS latest_hour FROM rankings WHERE country = ? AND snapshot_date = (SELECT MAX(snapshot_date) FROM rankings WHERE country = ?)`,
        args: [cc, cc],
      });
  const latestHour = dateRes.rows[0]?.latest_hour as number | null;
  // A requested day with no rows has no hour either, so `date` alone is not proof the day exists —
  // the response must report the day actually returned, and that is null here.
  const snapshotDate = date
    ? latestHour === null
      ? null
      : date
    : ((dateRes.rows[0]?.latest as string | null) ?? null);

  const info = COUNTRY_MAP[cc];
  const base = {
    code: cc,
    name: info?.name ?? cc.toUpperCase(),
    flag: info?.flag ?? '🌏',
  };

  if (!snapshotDate) {
    return withCache(NextResponse.json({ ...base, date: null, items: [] }), date);
  }

  const result = await client.execute({
    // sticker_type rides along because the country page renders a TypeBadge per row: without it a
    // client-side date switch would silently drop every animated/popup/sound pill.
    sql: `SELECT r.rank, p.id, p.name, p.image_url, p.author, p.sticker_type
          FROM rankings r
          JOIN products p ON p.id = r.product_id
          WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ?
          ORDER BY r.rank ASC
          LIMIT ?`,
    args: [cc, snapshotDate, latestHour, limit],
  });

  return withCache(
    NextResponse.json({
      ...base,
      date: snapshotDate,
      items: result.rows.map((row) => ({
        rank: row.rank as number,
        id: row.id as string,
        name: row.name as string,
        image_url: row.image_url as string | null,
        author: row.author as string | null,
        sticker_type: row.sticker_type as string | null,
      })),
    }),
    date
  );
}

/**
 * The read budget for browsing the archive, exactly as on /api/top-stickers: a day strictly in the
 * past can never change, so its response is cached at the CDN for a week and repeat views cost zero
 * database reads. The live snapshot is still being written to hourly and is never cached.
 */
function withCache(res: NextResponse, date: string | null): NextResponse {
  if (isArchivedDay(date)) {
    res.headers.set('Cache-Control', ARCHIVED_DAY_CACHE_CONTROL);
  }
  return res;
}
