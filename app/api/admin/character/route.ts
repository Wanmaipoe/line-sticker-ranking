import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/admin/auth';
import { isCharacterKey } from '@/lib/characters';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs'; // node:crypto for the auth check + a DB write
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/character — admin-only manual correction of a sticker's character category.
 * Body: { id: string, character: <valid character key> }. Sets character_source='manual' so the
 * daily classifier never overwrites the correction. This is the app's only product-write route, so
 * the auth check gates real data, not just a page.
 */
export async function POST(req: Request) {
  const jar = await cookies();
  if (!verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  let body: { id?: unknown; character?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { id, character } = body;
  if (typeof id !== 'string' || !id || !isCharacterKey(character)) {
    return NextResponse.json({ error: 'Invalid id or character' }, { status: 400 });
  }

  try {
    const res = await getDb().execute({
      sql: `UPDATE products SET character_type = ?, character_source = 'manual' WHERE id = ?`,
      args: [character, id],
    });
    if (res.rowsAffected === 0) {
      return NextResponse.json({ error: 'No such sticker' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id, character });
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
