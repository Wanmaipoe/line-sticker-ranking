import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ADMIN_COOKIE,
  ADMIN_TTL_SECONDS,
  checkAdminPassword,
  isAdminConfigured,
  issueAdminToken,
  verifyAdminToken,
} from '@/lib/admin/auth';

export const runtime = 'nodejs'; // needs node:crypto
export const dynamic = 'force-dynamic';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/** GET — is the current request an authenticated admin? Lets the client reveal edit controls. */
export async function GET() {
  const jar = await cookies();
  return NextResponse.json({ authed: verifyAdminToken(jar.get(ADMIN_COOKIE)?.value) });
}

/** POST — exchange the admin password for a session cookie. */
export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin editing is not configured. Set ADMIN_PASSWORD in the Vercel project env.' },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    password = (await req.json())?.password;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (!checkAdminPassword(password)) {
    // ~500ms tax on wrong guesses (serverless instances don't share memory, so this is a speed bump,
    // not a real limiter — the real defence is a long random ADMIN_PASSWORD).
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, issueAdminToken(), { ...cookieOptions, maxAge: ADMIN_TTL_SECONDS });
  return res;
}

/** DELETE — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
