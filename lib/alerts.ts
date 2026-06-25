import { randomUUID } from 'crypto';
import { type Client } from '@libsql/client';
import { getLatestRankingsForProduct } from './db';
import { COUNTRY_MAP } from './countries';
import { appUrl } from './email';

// ───────────────────────── subscribers & follows ─────────────────────────

export type FollowResult = { status: 'verify_sent' | 'already_following'; email: string; token: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

// Add a follow for (email → sticker). Creates the subscriber unverified on first contact.
// Returns whether a verification email still needs to be sent.
export async function followSticker(client: Client, emailRaw: string, stickerId: string): Promise<FollowResult> {
  const email = emailRaw.trim().toLowerCase();
  const existing = await client.execute({ sql: 'SELECT id, verified, token FROM subscribers WHERE email = ?', args: [email] });

  let subId: number;
  let verified: number;
  let token: string;
  if (existing.rows.length) {
    subId = Number(existing.rows[0].id);
    verified = existing.rows[0].verified as number;
    token = existing.rows[0].token as string;
  } else {
    token = randomUUID();
    const ins = await client.execute({
      sql: 'INSERT INTO subscribers (email, verified, token, created_at) VALUES (?, 0, ?, ?)',
      args: [email, token, new Date().toISOString()],
    });
    subId = Number(ins.lastInsertRowid);
    verified = 0;
  }

  await client.execute({
    sql: 'INSERT OR IGNORE INTO follows (subscriber_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)',
    args: [subId, 'sticker', stickerId, new Date().toISOString()],
  });

  return { status: verified ? 'already_following' : 'verify_sent', email, token };
}

export async function verifyByToken(client: Client, token: string): Promise<string | null> {
  const r = await client.execute({ sql: 'SELECT email FROM subscribers WHERE token = ?', args: [token] });
  if (!r.rows.length) return null;
  await client.execute({ sql: 'UPDATE subscribers SET verified = 1 WHERE token = ?', args: [token] });
  return r.rows[0].email as string;
}

export async function unsubscribeByToken(client: Client, token: string): Promise<string | null> {
  const r = await client.execute({ sql: 'SELECT id, email FROM subscribers WHERE token = ?', args: [token] });
  if (!r.rows.length) return null;
  const id = Number(r.rows[0].id);
  await client.execute({ sql: 'DELETE FROM follows WHERE subscriber_id = ?', args: [id] });
  await client.execute({ sql: 'DELETE FROM subscribers WHERE id = ?', args: [id] });
  return r.rows[0].email as string;
}

// ───────────────────────── alert computation ─────────────────────────

export interface StickerEvent { country: string; msg: string; rank: number }

// A country only counts if its latest snapshot is recent — otherwise the sticker has
// dropped out there and there's nothing new to report.
const FRESH_HOURS = 30;

function eventForCountry(r: {
  country: string; current_rank: number; snapshot_date: string; snapshot_hour: number;
  rank_24h_ago: number | null; best_30d: number | null;
}): StickerEvent | null {
  const ageH =
    (Date.now() - Date.parse(`${r.snapshot_date}T${String(r.snapshot_hour).padStart(2, '0')}:00:00Z`)) / 3_600_000;
  if (ageH > FRESH_HOURS) return null;

  const cur = r.current_rank;
  const prev = r.rank_24h_ago;
  if (prev == null) return null; // no 24h baseline → nothing to compare yet

  // improvement crossings (most exciting first)
  if (prev > 10 && cur <= 10) return { country: r.country, msg: `🎯 entered Top 10`, rank: cur };
  if (prev > 50 && cur <= 50) return { country: r.country, msg: `📈 entered Top 50`, rank: cur };
  if (prev > 100 && cur <= 100) return { country: r.country, msg: `entered Top 100`, rank: cur };
  // worsening crossings
  if (prev <= 10 && cur > 10) return { country: r.country, msg: `⚠️ dropped out of Top 10`, rank: cur };
  if (prev <= 100 && cur > 100) return { country: r.country, msg: `⚠️ dropped out of Top 100`, rank: cur };
  // new 30-day best (best_30d includes today, so equality = today is the best)
  if (r.best_30d != null && cur === r.best_30d && cur < prev) return { country: r.country, msg: `🏆 new 30-day best`, rank: cur };
  // big move
  const delta = prev - cur;
  if (delta >= 20) return { country: r.country, msg: `📈 up ${delta}`, rank: cur };
  if (delta <= -20) return { country: r.country, msg: `📉 down ${-delta}`, rank: cur };

  return null;
}

export async function computeStickerEvents(client: Client, stickerId: string): Promise<StickerEvent[]> {
  const rankings = await getLatestRankingsForProduct(client, stickerId);
  return rankings.map(eventForCountry).filter((e): e is StickerEvent => e !== null);
}

// ───────────────────────── email templates (inline-styled for mail clients) ─────────────────────────

const SHELL = (inner: string, token?: string) => `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="font-weight:700;font-size:18px;margin-bottom:16px">LineStickerRanking</div>
  ${inner}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px">
  <div style="font-size:12px;color:#999">
    You're getting this because you asked for rank alerts.${
      token ? ` <a href="${appUrl(`/api/alerts/unsubscribe?token=${token}`)}" style="color:#999">Unsubscribe</a>.` : ''
    }
  </div>
</div>`;

export function verifyEmailHtml(token: string): string {
  const link = appUrl(`/api/alerts/verify?token=${token}`);
  return SHELL(`
    <p style="font-size:15px;line-height:1.6">Confirm your email to start getting rank alerts for the stickers you follow.</p>
    <p style="margin:20px 0">
      <a href="${link}" style="background:#06c755;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">Confirm my alerts</a>
    </p>
    <p style="font-size:12px;color:#999">If the button doesn't work, paste this link:<br>${link}</p>
  `);
}

export interface DigestItem { name: string; events: StickerEvent[] }

export function digestEmailHtml(items: DigestItem[], token: string): string {
  const rows = items
    .map((it) => {
      const lines = it.events
        .map(
          (e) =>
            `<div style="font-size:13px;color:#555;margin:2px 0">${COUNTRY_MAP[e.country]?.flag ?? ''} ${
              COUNTRY_MAP[e.country]?.name ?? e.country.toUpperCase()
            } — ${e.msg} <span style="color:#888">(#${e.rank})</span></div>`
        )
        .join('');
      return `<div style="padding:12px 0;border-top:1px solid #f0f0f0"><div style="font-weight:600;font-size:14px;margin-bottom:4px">${it.name}</div>${lines}</div>`;
    })
    .join('');
  return SHELL(
    `<p style="font-size:15px;line-height:1.6">Here's what moved in the last 24 hours for the stickers you follow:</p>${rows}
     <p style="margin-top:16px"><a href="${appUrl('/')}" style="color:#06c755;font-size:13px">Open LineStickerRanking →</a></p>`,
    token
  );
}
