/**
 * Backfill author, price, description for existing products
 * by re-fetching today's rankings (which include these fields).
 *
 * Usage: node scripts/backfill-author.mjs
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

const BASE = 'https://linesticker.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const COUNTRIES = ['th', 'jp', 'tw', 'kr', 'id', 'my', 'sg', 'hk', 'ph', 'vn', 'us', 'gb', 'au', 'cn', 'fr', 'de', 'br', 'sa'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error('success=false');
  return json;
}

async function getLatestDate(country) {
  const r = await apiFetch(`/api/dates?country=${country}`);
  return r.data[0];
}

async function getRankingsPage(country, date, offset = 0) {
  const r = await apiFetch(`/api/rankings?country=${country}&date=${date}&limit=50&offset=${offset}`);
  return { data: r.data, hasMore: r.meta.hasMore };
}

let totalUpdated = 0;

for (const cc of COUNTRIES) {
  process.stdout.write(`[${cc}] `);
  try {
    const date = await getLatestDate(cc);
    let offset = 0;
    const items = [];

    while (true) {
      const { data, hasMore } = await getRankingsPage(cc, date, offset);
      items.push(...data);
      if (!hasMore) break;
      offset += 50;
      await sleep(200);
    }

    // Batch update products with author/price/description
    const statements = items
      .filter(item => item.author || item.price != null || item.description)
      .map(item => ({
        sql: `UPDATE products SET
                author = COALESCE(?, author),
                price = COALESCE(?, price),
                price_currency = COALESCE(?, price_currency),
                description = COALESCE(?, description)
              WHERE id = ?`,
        args: [
          item.author ?? null,
          item.price ?? null,
          item.price_currency ?? null,
          item.description ?? null,
          item.sticker_id,
        ],
      }));

    if (statements.length) {
      await client.batch(statements, 'write');
    }

    totalUpdated += statements.length;
    console.log(`${items.length} items, ${statements.length} updated`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
  await sleep(300);
}

console.log(`\nDone! Total products updated: ${totalUpdated}`);
