import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { followSticker, isValidEmail, verifyEmailHtml } from '@/lib/alerts';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { email?: string; stickerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const email = String(body?.email ?? '').trim();
  const stickerId = String(body?.stickerId ?? '').trim();
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 });
  if (!/^\d+$/.test(stickerId)) return NextResponse.json({ error: 'invalid sticker' }, { status: 400 });

  const client = getDb();
  const result = await followSticker(client, email, stickerId);

  if (result.status === 'verify_sent') {
    try {
      await sendEmail(result.email, 'Confirm your LineStickerRanking alerts', verifyEmailHtml(result.token));
    } catch (e) {
      console.error('verify email failed', e);
      return NextResponse.json({ error: 'Could not send the confirmation email — try again' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, status: result.status });
}
