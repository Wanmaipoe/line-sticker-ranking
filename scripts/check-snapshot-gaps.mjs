// One-off diagnostic: list every snapshot (date, hour) for one country over the last 2 days with
// its row count + when it was written, to see exactly when the hourly cadence broke.
// Cost note: covering-index scan over ~2 days of one country (~24k index rows) — a bounded,
// one-off read spend, acceptable for incident diagnosis.
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

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const cc = (process.argv[2] ?? 'th').toLowerCase();

const r = await client.execute({
  sql: `SELECT snapshot_date, snapshot_hour, COUNT(*) AS rows, MIN(created_at) AS written_at
        FROM rankings
        WHERE country = ? AND snapshot_date >= date('now', '-2 days')
        GROUP BY snapshot_date, snapshot_hour
        ORDER BY snapshot_date ASC, snapshot_hour ASC`,
  args: [cc],
});
console.log(`country=${cc} — snapshots over the last 2 days (times are UTC):`);
for (const row of r.rows) {
  console.log(`  ${row.snapshot_date} h${String(row.snapshot_hour).padStart(2, '0')}  rows=${row.rows}  written=${row.written_at}`);
}
console.log(`total snapshots: ${r.rows.length}`);
process.exit(0);
