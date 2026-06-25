import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { computeStickerEvents, digestEmailHtml, type DigestItem, type StickerEvent } from '@/lib/alerts';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true; // Vercel Cron
  if (req.headers.get('x-cron-secret') === secret) return true; // manual trigger
  if (req.nextUrl.searchParams.get('secret') === secret) return true; // manual trigger
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ?preview=you@email.com — send a sample digest so we can eyeball the format on demand.
  const preview = req.nextUrl.searchParams.get('preview');
  if (preview) {
    const sample: DigestItem[] = [
      { name: 'Silly Goofy Dip Catto V.3', events: [
        { country: 'tw', msg: '🎯 entered Top 10', rank: 8 },
        { country: 'th', msg: '📈 up 24', rank: 27 },
      ] },
      { name: 'Bowl Cut Piggo V.2', events: [
        { country: 'jp', msg: '⚠️ dropped out of Top 100', rank: 369 },
      ] },
    ];
    await sendEmail(preview, '📊 Your tracked stickers moved (preview)', digestEmailHtml(sample, 'preview-token'));
    return NextResponse.json({ ok: true, preview });
  }

  const client = getDb();
  const rows = (
    await client.execute(`
      SELECT s.id AS sid, s.email, s.token, f.target_id AS sticker
      FROM subscribers s
      JOIN follows f ON f.subscriber_id = s.id
      WHERE s.verified = 1 AND f.target_type = 'sticker'
    `)
  ).rows;

  if (!rows.length) return NextResponse.json({ ok: true, sent: 0, note: 'no verified follows' });

  // Compute events once per distinct sticker.
  const stickerIds = [...new Set(rows.map((r) => r.sticker as string))];
  const eventsBySticker = new Map<string, StickerEvent[]>();
  for (const id of stickerIds) {
    eventsBySticker.set(id, await computeStickerEvents(client, id));
  }

  const ph = stickerIds.map(() => '?').join(',');
  const nameRows = (await client.execute({ sql: `SELECT id, name FROM products WHERE id IN (${ph})`, args: stickerIds })).rows;
  const nameById = new Map(nameRows.map((r) => [r.id as string, r.name as string]));

  // Group events per subscriber.
  const bySub = new Map<number, { email: string; token: string; items: DigestItem[] }>();
  for (const r of rows) {
    const events = eventsBySticker.get(r.sticker as string) ?? [];
    if (!events.length) continue;
    const sid = Number(r.sid);
    if (!bySub.has(sid)) bySub.set(sid, { email: r.email as string, token: r.token as string, items: [] });
    bySub.get(sid)!.items.push({ name: nameById.get(r.sticker as string) ?? (r.sticker as string), events });
  }

  let sent = 0;
  for (const sub of bySub.values()) {
    if (!sub.items.length) continue;
    try {
      await sendEmail(sub.email, '📊 Your tracked stickers moved', digestEmailHtml(sub.items, sub.token));
      sent += 1;
    } catch (e) {
      console.error('digest send failed', sub.email, e);
    }
  }

  return NextResponse.json({ ok: true, subscribers: bySub.size, sent });
}
