// Quick health check on the latest snapshot for a country.
// Usage: node scripts/check-latest.mjs th
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

const latest = await client.execute({
  sql: `SELECT MAX(snapshot_date) AS d, MAX(snapshot_hour) AS h FROM rankings WHERE country = ? AND snapshot_date = (SELECT MAX(snapshot_date) FROM rankings WHERE country = ?)`,
  args: [cc, cc],
});
const d = latest.rows[0].d, h = latest.rows[0].h;
console.log(`${cc.toUpperCase()} latest snapshot: ${d} h${h}`);

const dupes = await client.execute({
  sql: `SELECT rank, COUNT(*) AS n FROM rankings WHERE country=? AND snapshot_date=? AND snapshot_hour=? GROUP BY rank HAVING n > 1`,
  args: [cc, d, h],
});
console.log(dupes.rows.length === 0 ? 'no duplicate ranks ✓' : `DUPLICATE RANKS: ${dupes.rows.length}`);

const top = await client.execute({
  sql: `SELECT r.rank, p.name, p.author, p.price, p.price_currency, p.sticker_type
        FROM rankings r JOIN products p ON p.id = r.product_id
        WHERE r.country=? AND r.snapshot_date=? AND r.snapshot_hour=?
        ORDER BY r.rank ASC LIMIT 10`,
  args: [cc, d, h],
});
console.log('\nTop 10:');
for (const row of top.rows) {
  const price = row.price == null ? '—'
    : row.price_currency === 'USD' ? `$${(row.price / 100).toFixed(2)}`
    : `${row.price} ${row.price_currency ?? ''}`.trim();
  console.log(`  #${row.rank}  ${row.name}  · ${row.author ?? '?'} · ${price} · ${row.sticker_type ?? '?'}`);
}

const total = await client.execute({
  sql: `SELECT COUNT(*) AS n FROM rankings WHERE country=? AND snapshot_date=? AND snapshot_hour=?`,
  args: [cc, d, h],
});
console.log(`\nTotal rows in snapshot: ${total.rows[0].n}`);
