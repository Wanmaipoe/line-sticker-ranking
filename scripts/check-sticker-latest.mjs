// Diagnostic: recent per-hour ranks for one product/country, to see whether the detail table and
// the history graph disagree on the latest snapshot. Read-safe (PK-indexed, a dozen rows).
// Run: node --env-file=.env.local scripts/check-sticker-latest.mjs <productId>
import { createClient } from '@libsql/client';

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const pid = process.argv[2] ?? '34899310';

console.log('now UTC:', new Date().toISOString());
for (const cc of ['th', 'tw']) {
  const r = await client.execute({
    sql: `SELECT snapshot_date, snapshot_hour, rank, created_at FROM rankings
          WHERE product_id = ? AND country = ?
          ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 8`,
    args: [pid, cc],
  });
  console.log(`\n=== ${cc.toUpperCase()} last 8 snapshots (newest first) ===`);
  for (const row of r.rows) {
    console.log(`  ${row.snapshot_date} h${String(row.snapshot_hour).padStart(2, '0')} UTC  →  #${row.rank}   (written ${row.created_at})`);
  }
}
process.exit(0);
