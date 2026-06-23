/**
 * Migration: add author, price, price_currency, description to products table
 * Safe to run multiple times — skips columns that already exist
 *
 * Usage: node scripts/migrate-add-fields.mjs
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

const alterTable = [
  'ALTER TABLE products ADD COLUMN author TEXT',
  'ALTER TABLE products ADD COLUMN price INTEGER',
  'ALTER TABLE products ADD COLUMN price_currency TEXT',
  'ALTER TABLE products ADD COLUMN description TEXT',
];

const createIndex = [
  'CREATE INDEX IF NOT EXISTS idx_products_author ON products(author)',
];

for (const sql of alterTable) {
  try {
    await client.execute(sql);
    console.log(`✓ ${sql}`);
  } catch (err) {
    if (err.message?.includes('duplicate column')) {
      console.log(`- Already exists: ${sql.split(' ').slice(-2).join(' ')}`);
    } else {
      throw err;
    }
  }
}

for (const sql of createIndex) {
  await client.execute(sql);
  console.log(`✓ ${sql}`);
}

console.log('\nMigration complete!');
