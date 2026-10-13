/**
 * Adds first_date / first_rank to pack_best — the day a pack FIRST appeared in a market's top 500,
 * and the rank it entered at — and backfills them from the whole rankings history.
 *
 * Feeds the "when new packs arrive" weekday pattern on /insights. Same reasoning as best_rank (see
 * scripts/add-pack-best.mjs): deriving a first appearance at read time means scanning a pack's
 * whole history, and an index that answers it cheaply would be billed on every scraped row forever.
 * The hourly scrape fills these in for new packs as a side effect of its existing upsert: the row
 * is INSERTed with first_date = that snapshot's day, and the ON CONFLICT branch never touches it.
 *
 * READ THIS BEFORE USING THE DATA: every pack that was already charting when tracking began gets
 * first_date = the first tracked day (2026-05-24), because that is simply the day we started
 * looking. Those are not real debuts. Anything aggregating first_date must start the window the
 * day AFTER the first tracked date — scripts/compute-day-patterns.mjs does.
 *
 * Idempotent: the columns are added only if missing, and only NULL first_date rows are filled.
 * Run once:  node --env-file=.env.local scripts/add-pack-debut.mjs
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

const cols = (await client.execute('PRAGMA table_info(pack_best)')).rows.map((r) => String(r.name));
if (!cols.length) {
  console.error('ERROR: pack_best does not exist — run scripts/add-pack-best.mjs first');
  process.exit(1);
}
for (const [name, type] of [['first_date', 'TEXT'], ['first_rank', 'INTEGER']]) {
  if (cols.includes(name)) {
    console.log(`column already present: ${name}`);
  } else {
    await client.execute(`ALTER TABLE pack_best ADD COLUMN ${name} ${type}`);
    console.log(`column added: ${name}`);
  }
}

// The earliest row per pack/market. MIN() over date+hour as one sortable key, so SQLite's bare-column
// rule hands back snapshot_date and rank FROM THAT ROW — the entry rank, not an arbitrary one.
const placeholders = FEATURED.map(() => '?').join(',');
const res = await client.execute({
  sql: `UPDATE pack_best AS b
        SET first_date = f.d, first_rank = f.r
        FROM (
          SELECT product_id, country,
                 MIN(snapshot_date || printf('%02d', snapshot_hour)) AS first_key,
                 snapshot_date AS d, rank AS r
          FROM rankings
          WHERE country IN (${placeholders})
          GROUP BY product_id, country
        ) AS f
        WHERE b.product_id = f.product_id AND b.country = f.country AND b.first_date IS NULL`,
  args: FEATURED,
});
console.log(`backfilled first_date/first_rank: ${res.rowsAffected} rows`);

const check = await client.execute(`SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN first_date IS NULL THEN 1 ELSE 0 END) AS missing,
  MIN(first_date) AS earliest,
  SUM(CASE WHEN first_date = (SELECT MIN(first_date) FROM pack_best) THEN 1 ELSE 0 END) AS on_first_day
  FROM pack_best`);
const r = check.rows[0];
console.log(`pack_best: ${r.total} rows, ${r.missing} without a first date`);
console.log(`earliest first_date ${r.earliest} holds ${r.on_first_day} packs — the already-charting pile-up, excluded from the day patterns`);
process.exit(0);
