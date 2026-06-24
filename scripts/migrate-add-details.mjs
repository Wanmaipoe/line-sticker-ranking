/**
 * Adds detail columns to products for the LINE-official source:
 *   sticker_type  static | animation | popup | sound | popup_sound | name ...
 *   author_id     LINE creator id (from /stickershop/author/<id>)
 *
 * Idempotent: skips columns that already exist. Run once.
 * Usage: node scripts/migrate-add-details.mjs
 */

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

if (!process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: Missing TURSO_DATABASE_URL in .env.local');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const columns = [
  ['sticker_type', 'TEXT'],
  ['author_id', 'TEXT'],
];

for (const [name, type] of columns) {
  try {
    await client.execute(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
    console.log(`added column: ${name}`);
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log(`column already exists: ${name}`);
    } else {
      throw err;
    }
  }
}

await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_author_id ON products(author_id)`);
console.log('migration done');
