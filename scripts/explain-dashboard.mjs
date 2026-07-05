// Read-safe verification: EXPLAIN QUERY PLAN for the new homepage dashboard queries, to confirm
// they use indexes (SEARCH ... USING INDEX / PRIMARY KEY) and never SCAN the rankings table.
// EXPLAIN QUERY PLAN executes ~0 row reads. Run with:
//   node --env-file=.env.local scripts/explain-dashboard.mjs
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const cc = 'th';

const queries = [
  {
    label: 'top5 + old_rank (LEFT JOIN prev snapshot)',
    sql: `EXPLAIN QUERY PLAN
          SELECT r.rank, p.id, p.name, p.image_url, o.rank AS old_rank
          FROM rankings r
          JOIN products p ON p.id = r.product_id
          LEFT JOIN rankings o
            ON o.product_id = r.product_id AND o.country = r.country
            AND o.snapshot_date = ? AND o.snapshot_hour = ?
          WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ?
          ORDER BY r.rank ASC
          LIMIT 5`,
    args: ['2026-07-04', 15, cc, '2026-07-05', 16],
  },
  {
    label: '7-day sparkline history (IN 5 product_ids, PK)',
    sql: `EXPLAIN QUERY PLAN
          SELECT product_id, snapshot_date, snapshot_hour, rank
          FROM rankings
          WHERE product_id IN (?,?,?,?,?)
            AND country = ?
            AND snapshot_date >= date('now', ? || ' days')
          ORDER BY product_id ASC, snapshot_date ASC, snapshot_hour ASC`,
    args: ['a', 'b', 'c', 'd', 'e', cc, '-7'],
  },
];

for (const q of queries) {
  console.log(`\n=== ${q.label} ===`);
  try {
    const r = await client.execute({ sql: q.sql, args: q.args });
    for (const row of r.rows) {
      const detail = row.detail ?? row['detail'] ?? JSON.stringify(row);
      console.log('  ' + detail);
    }
  } catch (e) {
    console.log(`  [ERR] ${e.code ?? ''}: ${e.message}`);
  }
}
process.exit(0);
