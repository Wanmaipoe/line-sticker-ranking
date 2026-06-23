/**
 * One-time schema setup for Turso database.
 * Run once after creating your Turso database.
 *
 * Usage: node scripts/init-turso.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Load .env.local
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

await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    author TEXT,
    price INTEGER,
    price_currency TEXT,
    description TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rankings (
    product_id TEXT NOT NULL,
    country TEXT NOT NULL,
    rank INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    snapshot_hour INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (product_id, country, snapshot_date, snapshot_hour)
  );
  CREATE INDEX IF NOT EXISTS idx_rankings_product ON rankings(product_id);
  CREATE INDEX IF NOT EXISTS idx_rankings_country_date ON rankings(country, snapshot_date, snapshot_hour);
  CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  CREATE INDEX IF NOT EXISTS idx_products_author ON products(author);
`);

console.log('Turso schema initialized successfully!');
