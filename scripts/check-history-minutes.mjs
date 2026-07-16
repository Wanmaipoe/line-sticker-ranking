// Verify getRankingHistoryAll now carries the REAL capture minute (snapshot_minute) instead of
// implying :00. Prints the newest few TH rows with the label the chart would render (BKK).
// Run: node --env-file=.env.local scripts/check-history-minutes.mjs <productId>
import { createClient } from '@libsql/client';

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const pid = process.argv[2] ?? '32683849';

const r = await client.execute({
  sql: `SELECT country, snapshot_date, snapshot_hour, rank, created_at
        FROM rankings WHERE product_id = ? AND country = 'th'
        ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 5`,
  args: [pid],
});

const minuteOf = (c) => (c && Number.isFinite(new Date(c).getUTCMinutes()) ? new Date(c).getUTCMinutes() : 0);
const pad = (n) => String(n).padStart(2, '0');

console.log('hour bucket | real capture (UTC) | OLD chart label (BKK) | NEW chart label (BKK)');
for (const row of r.rows) {
  const min = minuteOf(row.created_at);
  const oldLabel = new Date(`${row.snapshot_date}T${pad(row.snapshot_hour)}:00:00Z`);
  const newLabel = new Date(`${row.snapshot_date}T${pad(row.snapshot_hour)}:${pad(min)}:00Z`);
  const bkk = (d) => d.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`h${pad(row.snapshot_hour)} #${row.rank} | ${String(row.created_at).slice(11, 19)} | ${bkk(oldLabel)} | ${bkk(newLabel)}`);
}
process.exit(0);
