// Server-only gate for admin actions (correcting a sticker's character category by hand).
// NEVER import this from a client component — it reads process.env.ADMIN_PASSWORD.
//
// Mirrors lib/revenue/auth.ts exactly (same stateless HMAC-token scheme, no DB reads to verify a
// session), but with its OWN password and cookie so admin access is separate from the revenue team.
// This gates a real WRITE (UPDATE products.character_type), so unlike /revenue it guards data, not
// just a page — keep ADMIN_PASSWORD long and random.
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const ADMIN_COOKIE = 'lsr_admin';
export const ADMIN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function signingKey(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash('sha256').update(`lsr-admin-v1:${pw}`).digest('hex') : null;
}

/** Constant-time password check. Both sides are hashed first so lengths always match. */
export function checkAdminPassword(input: unknown): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || typeof input !== 'string') return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(pw).digest();
  return timingSafeEqual(a, b);
}

/** Token = `<expiryMs>.<hmac>`. Stateless. */
export function issueAdminToken(now: number = Date.now()): string {
  const key = signingKey();
  if (!key) throw new Error('ADMIN_PASSWORD is not set');
  const exp = String(now + ADMIN_TTL_SECONDS * 1000);
  return `${exp}.${createHmac('sha256', key).update(exp).digest('hex')}`;
}

export function verifyAdminToken(token: string | undefined, now: number = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token) return false;

  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs <= now) return false;

  // Reject anything that isn't a bare sha256 hex digest BEFORE comparing — a planted cookie could
  // decode to a 64-char / 65-byte value that makes timingSafeEqual throw (see revenue/auth.ts).
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;

  const expected = createHmac('sha256', key).update(exp).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
