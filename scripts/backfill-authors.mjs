// Backfill products.author from each sticker's LINE Store detail page.
//
// The showcase/listing grid the hourly scraper reads has NO creator name — only the
// product detail page (/stickershop/product/<id>) does, in <a class="mdCMN38Item01Author">.
// So the hourly scrape leaves author NULL; this job fills it in a separate, rate-limited
// pass. Run it repeatedly (BATCH rows at a time) to chew through the backlog and to catch
// newly-charted stickers. Prioritises recently-updated (currently charting) products.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-authors.mjs          # default BATCH=300
//   BATCH=40 node --env-file=.env.local scripts/backfill-authors.mjs # smaller run
import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@libsql/client';

// Load .env.local for local runs (in CI the env is already set).
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
} catch { /* not local */ }

const BATCH = parseInt(process.env.BATCH ?? '300', 10);
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const rows = (await client.execute({
  sql: `SELECT id FROM products WHERE author IS NULL OR TRIM(author) = '' ORDER BY updated_at DESC LIMIT ?`,
  args: [BATCH],
})).rows;

console.log(`[backfill] ${rows.length} products missing author (BATCH=${BATCH})`);
let updated = 0, notFound = 0, errors = 0;

for (const { id } of rows) {
  try {
    const res = await fetch(`https://store.line.me/stickershop/product/${id}/en`, {
      headers: H,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) { errors++; continue; }
    const $ = cheerio.load(await res.text());
    const author = $('.mdCMN38Item01Author').first().text().trim();
    if (author) {
      // Guard so a concurrent/earlier fill is never overwritten.
      await client.execute({
        sql: `UPDATE products SET author = ? WHERE id = ? AND (author IS NULL OR TRIM(author) = '')`,
        args: [author, id],
      });
      updated++;
    } else {
      notFound++; // official sticker (no creator) or delisted product page
    }
  } catch {
    errors++;
  }
  await sleep(300); // be polite to LINE
}

console.log(`[backfill] done: ${updated} updated, ${notFound} no-author, ${errors} errors`);
process.exit(0);
