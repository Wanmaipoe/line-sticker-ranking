import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { COUNTRY_MAP } from '@/lib/countries';

// Freshness watchdog: the site's whole value is hourly data, so if the newest snapshot is older
// than STALE_HOURS the scraper pipeline is down (old computer off, GitHub Action throttled/failed)
// and the admin gets ONE email — deduped via a tiny meta table so an ongoing outage doesn't spam
// every check. Designed to be hit hourly by an external cron (cron-job.org) with the CRON_SECRET,
// plus a daily Vercel cron as backup. Read cost per check: ~6 index-seek rows — negligible.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STALE_HOURS = 2; // hourly cadence → >2h means at least one full missed cycle
const REALERT_HOURS = 6; // during an ongoing outage, remind at most every 6h

const COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'] as const;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true; // Vercel Cron
  if (req.headers.get('x-cron-secret') === secret) return true; // external cron / manual
  if (req.nextUrl.searchParams.get('secret') === secret) return true; // manual trigger
  return false;
}

function snapAgeHours(date: string, hour: number): number {
  return (Date.now() - Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)) / 3_600_000;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = getDb();

  // Per-country latest snapshot (index seek, 1 row each).
  let perCountry: { cc: string; date: string; hour: number; ageH: number }[];
  try {
    perCountry = await Promise.all(
      COUNTRIES.map(async (cc) => {
        const r = await client.execute({
          sql: `SELECT snapshot_date, snapshot_hour FROM rankings WHERE country = ?
                ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`,
          args: [cc],
        });
        const row = r.rows[0];
        const date = (row?.snapshot_date as string) ?? '1970-01-01';
        const hour = (row?.snapshot_hour as number) ?? 0;
        return { cc, date, hour, ageH: snapAgeHours(date, hour) };
      })
    );
  } catch (e) {
    // DB unreadable (e.g. read-quota block). We can't dedup without the DB, so don't email here —
    // an unreadable DB during a quota block would otherwise spam one email per check.
    return NextResponse.json({ ok: false, error: 'db-unreadable', detail: String(e) }, { status: 200 });
  }

  const freshest = Math.min(...perCountry.map((c) => c.ageH));
  const stale = freshest > STALE_HOURS;

  if (!stale) {
    return NextResponse.json({ ok: true, stale: false, freshestAgeHours: Number(freshest.toFixed(2)) });
  }

  // Dedup: only alert if we haven't alerted in the last REALERT_HOURS.
  await client.execute(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  const last = await client.execute({ sql: `SELECT value FROM meta WHERE key = 'stale_alert_at'`, args: [] });
  const lastAt = last.rows[0]?.value ? Date.parse(last.rows[0].value as string) : 0;
  const sinceLastH = (Date.now() - lastAt) / 3_600_000;
  if (sinceLastH < REALERT_HOURS) {
    return NextResponse.json({ ok: true, stale: true, alerted: false, note: `already alerted ${sinceLastH.toFixed(1)}h ago` });
  }

  const rows = perCountry
    .map((c) => {
      const info = COUNTRY_MAP[c.cc];
      return `<tr>
        <td style="padding:4px 12px 4px 0">${info?.flag ?? ''} ${info?.name ?? c.cc.toUpperCase()}</td>
        <td style="padding:4px 12px 4px 0">${c.date} h${String(c.hour).padStart(2, '0')} UTC</td>
        <td style="padding:4px 0;color:${c.ageH > STALE_HOURS ? '#dc2626' : '#16a34a'}">${c.ageH.toFixed(1)}h ago</td>
      </tr>`;
    })
    .join('');

  const html = `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="font-weight:700;font-size:18px;margin-bottom:12px">⚠️ LineStickerRanking — rankings data is stale</div>
  <p style="font-size:14px;line-height:1.6">The newest snapshot is <b>${freshest.toFixed(1)} hours old</b> (threshold: ${STALE_HOURS}h). The hourly scraper pipeline is probably not running.</p>
  <table style="font-size:13px;border-collapse:collapse;margin:12px 0">${rows}</table>
  <p style="font-size:13px;line-height:1.6;color:#555">
    Checklist:<br>
    1. Is the old computer on and its scheduled task running?<br>
    2. <a href="https://github.com/Wanmaipoe/line-sticker-ranking/actions">GitHub Actions runs</a> — any red runs, or none recently?<br>
    3. Quick fix: trigger "Run workflow" on the Scrape workflow, or run the scraper locally.
  </p>
</div>`;

  const admin = process.env.GMAIL_USER ?? 'linestickerranking@gmail.com';
  let alerted = false;
  try {
    await sendEmail(admin, `⚠️ LineStickerRanking data stale (${freshest.toFixed(1)}h old)`, html);
    alerted = true;
    await client.execute({
      sql: `INSERT INTO meta (key, value) VALUES ('stale_alert_at', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [new Date().toISOString()],
    });
  } catch (e) {
    console.error('stale alert send failed', e);
  }

  return NextResponse.json({ ok: true, stale: true, alerted, freshestAgeHours: Number(freshest.toFixed(2)) });
}
