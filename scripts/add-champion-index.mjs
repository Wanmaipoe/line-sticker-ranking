// One-time (idempotent) migration for the Daily #1 page. Run with:
//   node --env-file=.env.local scripts/add-champion-index.mjs
// Safe to re-run (IF NOT EXISTS) and non-destructive.
//
// Why a PARTIAL index. The page needs "who was rank 1, hour by hour, per country" over a
// multi-week window. The existing idx_rankings_country_date_hour is (country, snapshot_date,
// snapshot_hour, rank) — rank is the LAST column, so `WHERE country=? AND snapshot_date>=? AND
// rank=1` can only seek on (country, date) and must then scan every one of that range's ~500
// rows/hour to find the single rank-1 row. A 60-day window would read ~720k index entries per
// country, which is exactly the kind of query that caused the earlier read-quota outage.
//
// `WHERE rank = 1` makes the index hold ONLY the champion rows: 1 per country per hour, i.e. 3
// rows/hour site-wide (~26k/year) instead of a full copy of the table. SQLite uses a partial index
// whenever the query's WHERE implies the index's, and `rank = 1` appears literally in the query, so
// the same lookup becomes a pure index range scan of ~24 entries per country-day.
//
// product_id is in the index (not just the key columns) so the scan is covering — SQLite answers
// the whole query from the index without touching the table.
//
// Ongoing write cost is negligible: the hourly scrape inserts 1500 ranking rows but only 3 of them
// have rank = 1, so this index takes 3 extra writes per run, not 1500.
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SQL = `CREATE INDEX IF NOT EXISTS idx_rankings_rank1
               ON rankings(country, snapshot_date, snapshot_hour, product_id)
               WHERE rank = 1`;

try {
  const t = process.hrtime.bigint();
  await client.execute(SQL);
  console.log(`[OK]  idx_rankings_rank1 (${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(0)}ms)`);
} catch (e) {
  console.log(`[ERR] idx_rankings_rank1: code=${e.code ?? ''} | ${e.message}`);
  process.exit(1);
}

// Confirm the planner actually picks it — a partial index silently not being used would put the
// page back on the 720k-row scan this migration exists to avoid.
try {
  const plan = await client.execute(
    `EXPLAIN QUERY PLAN
     SELECT country, snapshot_date, snapshot_hour, product_id
     FROM rankings
     WHERE rank = 1 AND country IN ('jp','th','tw') AND snapshot_date >= '2026-01-01'
     ORDER BY country, snapshot_date, snapshot_hour`
  );
  console.log('\nQuery plan:');
  for (const r of plan.rows) console.log('  ' + r.detail);
  const usesIndex = plan.rows.some((r) => String(r.detail).includes('idx_rankings_rank1'));
  console.log(usesIndex ? '\n[OK]  planner uses idx_rankings_rank1' : '\n[WARN] planner is NOT using it');
} catch (e) {
  console.log(`\n(could not EXPLAIN — ${e.code ?? ''}: ${e.message})`);
}
