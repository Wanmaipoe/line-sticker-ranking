// EXPLAIN QUERY PLAN for the new "start of today" baseline lookup in getTrendingData.
// Confirms the row-value lower-bound + LIMIT 1 uses idx_rankings_country_date_hour (SEARCH, no SCAN).
// EXPLAIN executes ~0 row reads. Run: node --env-file=.env.local scripts/explain-movers.mjs
import { createClient } from '@libsql/client';

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const r = await client.execute({
  sql: `EXPLAIN QUERY PLAN
        SELECT snapshot_date, snapshot_hour FROM rankings
        WHERE country = ? AND (snapshot_date, snapshot_hour) >= (?, ?)
        ORDER BY snapshot_date ASC, snapshot_hour ASC LIMIT 1`,
  args: ['th', '2026-07-11', 17],
});
console.log('=== start-of-today baseline lookup ===');
for (const row of r.rows) console.log('  ' + (row.detail ?? JSON.stringify(row)));
process.exit(0);
