import { NextRequest, NextResponse } from 'next/server';
import { runDailyUpdate } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  // Manual trigger via x-cron-secret header
  const secretHeader = req.headers.get('x-cron-secret');
  if (secretHeader === process.env.CRON_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const summary = await runDailyUpdate();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const summary = await runDailyUpdate();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
