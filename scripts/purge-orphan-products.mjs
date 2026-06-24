// Removes products that have no ranking rows at all (orphans left behind after
// dropping non-featured countries). Safe: if such a sticker ever re-enters a tracked
// market's top 500, the scraper re-creates it. Idempotent.
// Usage: node scripts/purge-orphan-products.mjs
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) { const k = line.slice(0, i).trim(); if (k && !k.startsWith('#')) process.env[k] = line.slice(i + 1).trim(); }
}

const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const before = (await client.execute('SELECT COUNT(*) n FROM products')).rows[0].n;
const orphans = (await client.execute(
  'SELECT COUNT(*) n FROM products p WHERE NOT EXISTS (SELECT 1 FROM rankings r WHERE r.product_id = p.id)'
)).rows[0].n;

if (!orphans) {
  console.log('No orphan products — every product still has rankings.');
  process.exit(0);
}

await client.execute(
  'DELETE FROM products WHERE NOT EXISTS (SELECT 1 FROM rankings r WHERE r.product_id = products.id)'
);

const after = (await client.execute('SELECT COUNT(*) n FROM products')).rows[0].n;
console.log(`products: ${before} -> ${after} (removed ${before - after} orphans)`);
