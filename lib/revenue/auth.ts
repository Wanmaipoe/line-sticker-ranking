// Server-only gate for /revenue. NEVER import this from a client component — it reads
// process.env.REVENUE_PASSWORD, and a client import would ship the password to the browser.
//
// What this protects, honestly: the TOOL, not the data. Revenue CSVs are parsed entirely in the
// browser and never reach our servers or DB, so a session cookie is about keeping strangers out of
// a page, not about guarding secrets we hold. That's why a shared team password is proportionate
// here and full OAuth would be ceremony.
//
// The signing key is DERIVED from the password, which means changing REVENUE_PASSWORD in Vercel
// instantly invalidates every existing session. That's the intended way to kick someone out.
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const REVENUE_COOKIE = 'lsr_rev';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // monthly tool; don't make them re-auth often

export function isConfigured(): boolean {
  return Boolean(process.env.REVENUE_PASSWORD);
}

function signingKey(): string | null {
  const pw = process.env.REVENUE_PASSWORD;
  return pw ? createHash('sha256').update(`lsr-revenue-v1:${pw}`).digest('hex') : null;
}

/** Constant-time password check. Both sides are hashed first so lengths always match. */
export function checkPassword(input: unknown): boolean {
  const pw = process.env.REVENUE_PASSWORD;
  if (!pw || typeof input !== 'string') return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(pw).digest();
  return timingSafeEqual(a, b);
}

/** Token = `<expiryMs>.<hmac>`. Stateless, so no DB reads to check a session. */
export function issueToken(now: number = Date.now()): string {
  const key = signingKey();
  if (!key) throw new Error('REVENUE_PASSWORD is not set');
  const exp = String(now + SESSION_TTL_SECONDS * 1000);
  return `${exp}.${createHmac('sha256', key).update(exp).digest('hex')}`;
}

export function verifyToken(token: string | undefined, now: number = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token) return false;

  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs <= now) return false;

  // Reject anything that isn't a bare sha256 hex digest BEFORE comparing. Next decodes cookie
  // values with decodeURIComponent, so a planted `%C3%A9...` arrives as one non-ASCII char: a
  // 64-CHARACTER sig that is 65 BYTES. A string-length check would pass it through and
  // timingSafeEqual would throw RangeError, 500ing the page with no login form to recover from.
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;

  const expected = createHmac('sha256', key).update(exp).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
