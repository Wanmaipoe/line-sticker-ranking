// One-time (idempotent) migration: add the indexes the read-heavy queries need so they
// stop full-scanning the rankings table. Run with:
//   node --env-file=.env.local scripts/add-indexes.mjs
// Safe to re-run (IF NOT EXISTS) and non-destructive.
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const statements = [
  // Covers every country-scoped ranking query: dashboard/country top-N
  // (WHERE country=? AND snapshot_date=? AND snapshot_hour=? ORDER BY rank),
  // country MAX(snapshot_date), trending DISTINCT snapshots, and the per-country
  // "latest snapshot" CTEs in lib/db.ts. This is the big one.
  `CREATE INDEX IF NOT EXISTS idx_rankings_country_date_hour
     ON rankings(country, snapshot_date, snapshot_hour, rank)`,

  // Serves the dashboard's global "latest snapshot" query
  // (ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1).
  `CREATE INDEX IF NOT EXISTS idx_rankings_date_hour
     ON rankings(snapshot_date, snapshot_hour)`,

  // Creator pages filter products by author (getProductsByAuthor: WHERE author=?).
  `CREATE INDEX IF NOT EXISTS idx_products_author
     ON products(author)`,
];

for (const sql of statements) {
  const label = sql.match(/idx_[a-z_]+/)?.[0] ?? sql.slice(0, 40);
  try {
    const t = process.hrtime.bigint();
    await client.execute(sql);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(`[OK]  ${label} (${ms.toFixed(0)}ms)`);
  } catch (e) {
    console.log(`[ERR] ${label}: code=${e.code ?? ''} | ${e.message}`);
  }
}

// Show the resulting index list if reads are allowed (nice confirmation; may be blocked).
try {
  const r = await client.execute(
    "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
  );
  console.log('\nIndexes present:', JSON.stringify(r.rows));
} catch (e) {
  console.log(`\n(could not list indexes — ${e.code ?? ''}: reads still blocked)`);
}
process.exit(0);
