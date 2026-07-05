import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getDashboardData } from '@/lib/homedata';

export const runtime = 'nodejs';
// Cache for 10 min. The homepage is now server-rendered from the same getDashboardData(), so this
// route is a fallback (used only if the server render couldn't fetch) — but keep it cached so any
// caller amortizes the read across the window.
export const revalidate = 600;

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData(getDb()));
  } catch {
    // DB unreadable (e.g. Turso read quota) — empty payload with HTTP 200 so callers degrade
    // gracefully instead of hitting a 500.
    return NextResponse.json({ date: null, updatedAt: null, countries: [] });
  }
}
