/**
 * Adds a partial index so scripts/backfill-authors.mjs stops scanning the products table.
 *
 * WHY: backfill-authors runs inside the HOURLY scrape workflow and selected its work queue with
 *   WHERE author IS NULL OR TRIM(author) = '' ORDER BY updated_at DESC LIMIT 300
 * TRIM() cannot use an index, so every run walked all ~34k products — 33,944 rows read per run
 * (measured), 24 times a day, ~24M rows a month, to find packs that still need a creator name.
 *
 * WHY THE PREDICATE IS ONLY `author IS NULL`: measured on production there are 2,961 missing
 * authors and ZERO empty-string ones — the scraper writes `author || null`, never ''. Keeping an
 * `OR author = ''` branch (a first version of this migration did) matches nothing, yet it pushes
 * SQLite into a MULTI-INDEX OR over idx_products_author followed by a temp B-tree sort: 5,923 rows
 * read, twice the whole missing set. With a single predicate this partial index satisfies both the
 * filter AND the ORDER BY, so the queue query walks it backwards and stops after LIMIT rows.
 *
 * EVEN THEN the planner will not choose it on its own: with no sqlite_stat1 (and ANALYZE would itself
 * scan every table) it prefers the equality lookup on idx_products_author plus a sort — 5,923 rows.
 * So backfill-authors names this index with INDEXED BY. Measured on production: 33,944 rows -> 300,
 * returning the identical 300 ids in the identical order. A side benefit of INDEXED BY: if this index
 * is ever dropped the query errors loudly instead of silently going back to a scan.
 *
 * Step 1 folds any blank author into NULL so the single `author IS NULL` predicate misses nothing.
 *
 * Idempotent. Run once:  node scripts/add-author-index.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

try {
  const env = readFileSync('.env.local', 'utf8');
  for (const line of env.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (key && !key.startsWith('#')) process.env[key] = val;
    }
  }
} catch {}

if (!process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: Missing TURSO_DATABASE_URL in .env.local');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 1. Blank or whitespace-only authors become NULL, so `author IS NULL` is the complete work queue.
const norm = await client.execute(`UPDATE products SET author = NULL WHERE author IS NOT NULL AND TRIM(author) = ''`);
console.log(`normalised blank authors to NULL: ${norm.rowsAffected}`);

// 2. Replace any earlier version of this index (the OR predicate) with the single-predicate one.
await client.execute(`DROP INDEX IF EXISTS idx_products_author_missing`);
// COVERING (updated_at, id): the queue only needs id, so the index answers the whole query without
// touching the table.
await client.execute(
  `CREATE INDEX IF NOT EXISTS idx_products_author_missing ON products(updated_at, id) WHERE author IS NULL`
);
console.log('index ready: idx_products_author_missing ON products(updated_at, id) WHERE author IS NULL');

console.log('migration done');
