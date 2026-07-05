import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTrendingData } from '@/lib/homedata';

export const runtime = 'nodejs';
export const revalidate = 300;

export async function GET() {
  try {
    return NextResponse.json(await getTrendingData(getDb()));
  } catch {
    // DB unreadable (e.g. Turso read quota) — empty payload with HTTP 200 instead of a 500.
    return NextResponse.json({ countries: [] });
  }
}
