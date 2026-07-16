import { NextResponse } from 'next/server';
import {
  REVENUE_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  isConfigured,
  issueToken,
} from '@/lib/revenue/auth';

export const runtime = 'nodejs'; // needs node:crypto
export const dynamic = 'force-dynamic';

const cookieOptions = {
  httpOnly: true, // no client JS can read it, so an XSS can't lift the session
  secure: process.env.NODE_ENV === 'production', // plain http on localhost during dev
  sameSite: 'lax' as const,
  path: '/',
};

/** POST /api/revenue/session — exchange the team password for a session cookie. */
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Revenue tool is not configured. Set REVENUE_PASSWORD in the Vercel project env.' },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    password = (await req.json())?.password;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!checkPassword(password)) {
    // Constant ~500ms tax on failures. Not a real rate limiter (serverless instances don't share
    // memory), but it turns an online guessing run into a slow one. The actual defence is a long
    // random password.
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(REVENUE_COOKIE, issueToken(), { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
  return res;
}

/** DELETE /api/revenue/session — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(REVENUE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
