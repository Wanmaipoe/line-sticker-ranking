// Reports detail-coverage for the products that are CURRENTLY ranked (what users see),
// vs the whole table. Helps decide whether a backfill pass is still needed.
// Usage: node scripts/check-coverage.mjs
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) { const i = line.indexOf('='); if (i > 0) { const k = line.slice(0, i).trim(); if (k && !k.startsWith('#')) process.env[k] = line.slice(i + 1).trim(); } }
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// products ranked in the latest snapshot of any tracked country
const rankedFilter = `EXISTS (
  SELECT 1 FROM rankings r
  WHERE r.product_id = p.id
    AND r.snapshot_date = (SELECT MAX(snapshot_date) FROM rankings)
)`;

const q = async (sql) => (await c.execute(sql)).rows[0].n;
const ranked = await q(`SELECT COUNT(*) n FROM products p WHERE ${rankedFilter}`);
const rankedUsd = await q(`SELECT COUNT(*) n FROM products p WHERE ${rankedFilter} AND price_currency='USD'`);
const rankedAuthor = await q(`SELECT COUNT(*) n FROM products p WHERE ${rankedFilter} AND author IS NOT NULL AND TRIM(author)!=''`);
const rankedBadCur = await q(`SELECT COUNT(*) n FROM products p WHERE ${rankedFilter} AND price_currency IS NOT NULL AND price_currency!='USD'`);

const pct = (a, b) => b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a';
console.log('currently-ranked products:', ranked);
console.log(`  with USD price : ${rankedUsd} (${pct(rankedUsd, ranked)})`);
console.log(`  with author    : ${rankedAuthor} (${pct(rankedAuthor, ranked)})`);
console.log(`  stale currency : ${rankedBadCur}`);
