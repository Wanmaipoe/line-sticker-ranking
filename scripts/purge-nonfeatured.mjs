// One-time cleanup: remove ranking rows for countries that were NEVER part of the product.
// Idempotent — safe to re-run. Usage: node scripts/purge-nonfeatured.mjs
//
// ⚠ DO NOT "tidy" the KEEP list below to match lib/countries.ts FEATURED_COUNTRIES.
// Indonesia and the US were retired from SCRAPING on 2026-08-06, but their history is
// deliberately RETAINED. This script does `DELETE FROM rankings WHERE country NOT IN (KEEP)`, so
// dropping id/us from this array would erase millions of historical rows in one burst — and on
// this database every deleted row is metered across 3 B-trees, which would also spike the
// write quota. The list here is a RETENTION policy and is intentionally broader than the
// scraping policy.
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) { const k = line.slice(0, i).trim(); if (k && !k.startsWith('#')) process.env[k] = line.slice(i + 1).trim(); }
}

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
// RETENTION list (see the warning at the top) — NOT the scraping list. Keep id/us here.
const KEEP_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'];
const FEATURED = KEEP_COUNTRIES;
const ph = FEATURED.map(() => '?').join(',');

const before = (await client.execute('SELECT COUNT(*) n FROM rankings')).rows[0].n;
const toDelete = (await client.execute({
  sql: `SELECT country, COUNT(*) n FROM rankings WHERE country NOT IN (${ph}) GROUP BY country ORDER BY n DESC`,
  args: FEATURED,
})).rows;

if (!toDelete.length) {
  console.log('Nothing to purge — rankings already only contain featured markets.');
  process.exit(0);
}

console.log('Will delete ranking rows for:');
for (const r of toDelete) console.log(`  ${r.country}: ${r.n}`);

await client.execute({ sql: `DELETE FROM rankings WHERE country NOT IN (${ph})`, args: FEATURED });

const after = (await client.execute('SELECT COUNT(*) n FROM rankings')).rows[0].n;
const orphans = (await client.execute(
  'SELECT COUNT(*) n FROM products p WHERE NOT EXISTS (SELECT 1 FROM rankings r WHERE r.product_id = p.id)'
)).rows[0].n;

console.log(`\nrankings: ${before} -> ${after} (removed ${before - after})`);
console.log(`products with no rankings now (orphans, kept): ${orphans}`);
