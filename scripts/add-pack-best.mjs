/**
 * Creates pack_best — each pack's best (lowest) rank ever seen in a market — and backfills it from
 * the whole rankings history. Powers the "All time" column on /sticker/[id].
 *
 * WHY A TABLE AND NOT AN INDEX: the page needs MIN(rank) for one pack in one market with no date
 * filter, which means reading that pack's entire history: measured on production, 2,520 rows for
 * one country on a long-charting pack, ~3,100 for its three markets — roughly doubling what a
 * sticker page reads. An index on rankings(product_id, country, rank) would answer it in one seek,
 * but index upkeep is BILLED as rows written: measured on this database, 200 inserts into a table
 * with two indexes cost 600 rows_written. rankings already carries three indexes, so the hourly
 * scrape (1,500 rows) already writes ~4,500 rows an hour; a fourth index would add ~1.1M writes a
 * month plus a one-time ~3.8M to build it, against a 10M/month quota.
 *
 * This table costs instead: 3 reads per sticker page (one per market), a handful of writes an hour
 * (only when a pack actually beats its own record), and this one-time backfill.
 *
 * The backfill leans on SQLite's documented bare-column rule: with MIN(rank) in the SELECT, the
 * bare snapshot_date comes from the row that MIN matched, so best_date is the day the record was set.
 *
 * Idempotent — safe to re-run; re-running also repairs any drift (it only lowers a record).
 * Run once:  node --env-file=.env.local scripts/add-pack-best.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      if (k && !k.startsWith('#') && !process.env[k]) process.env[k] = line.slice(i + 1).trim();
    }
  }
} catch {
  /* not local — CI already has the env */
}

if (!process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const FEATURED = ['jp', 'th', 'tw'];
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await client.execute(`CREATE TABLE IF NOT EXISTS pack_best (
  product_id TEXT NOT NULL,
  country TEXT NOT NULL,
  best_rank INTEGER NOT NULL,
  best_date TEXT NOT NULL,
  PRIMARY KEY (product_id, country)
)`);
console.log('table ready: pack_best');

// Featured markets only: those are the ones the page shows, and retired id/us rows would just add
// dead weight. Re-run this script if a market is ever added back.
const placeholders = FEATURED.map(() => '?').join(',');
const res = await client.execute({
  sql: `INSERT INTO pack_best (product_id, country, best_rank, best_date)
        SELECT product_id, country, MIN(rank), snapshot_date
        FROM rankings
        WHERE country IN (${placeholders})
        GROUP BY product_id, country
        ON CONFLICT(product_id, country) DO UPDATE SET
          best_rank = excluded.best_rank,
          best_date = excluded.best_date
        WHERE excluded.best_rank < pack_best.best_rank`,
  args: FEATURED,
});
console.log(`backfilled: ${res.rowsAffected} rows written`);

const count = await client.execute('SELECT COUNT(*) AS n FROM pack_best');
console.log(`pack_best now holds ${count.rows[0].n} pack/market records`);
process.exit(0);
