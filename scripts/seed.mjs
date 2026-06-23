/**
 * Full historical seed from linesticker.app → Turso cloud database.
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local
 *
 * Usage: node scripts/seed.mjs
 * Usage (fewer days): node scripts/seed.mjs --days 3
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

const BASE = 'https://linesticker.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const COUNTRIES = [
  'th', 'jp', 'tw', 'kr', 'id', 'my', 'sg', 'hk', 'ph', 'vn',
  'us', 'gb', 'au', 'cn', 'fr', 'de', 'br', 'sa',
];

const maxDays = process.argv.includes('--days')
  ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10)
  : 30;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`success=false for ${path}`);
  return json;
}

async function getDates(country) {
  const r = await apiFetch(`/api/dates?country=${country}`);
  return r.data;
}

async function getRankingsAllPages(country, date) {
  const all = [];
  let offset = 0;
  while (true) {
    const r = await apiFetch(`/api/rankings?country=${country}&date=${date}&limit=50&offset=${offset}`);
    all.push(...r.data);
    if (!r.meta.hasMore) break;
    offset += 50;
    await sleep(300);
  }
  return all;
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  console.log(`\nSeeding from linesticker.app → Turso`);
  console.log(`Max days per country: ${maxDays}`);
  console.log(`Countries: ${COUNTRIES.join(', ')}\n`);

  for (const cc of COUNTRIES) {
    process.stdout.write(`[${cc}] Fetching dates... `);
    let dates;
    try {
      dates = (await getDates(cc)).slice(0, maxDays);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      continue;
    }
    console.log(`${dates.length} dates`);

    for (const date of dates) {
      process.stdout.write(`  ${date} ... `);
      try {
        const items = await getRankingsAllPages(cc, date);
        const now = new Date().toISOString();

        const statements = items.flatMap(item => [
          {
            sql: `INSERT INTO products (id, name, image_url, updated_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    image_url = excluded.image_url,
                    updated_at = excluded.updated_at`,
            args: [item.sticker_id, item.title, item.image_url ?? null, now],
          },
          {
            sql: `INSERT OR REPLACE INTO rankings (product_id, country, rank, snapshot_date, snapshot_hour, created_at)
                  VALUES (?, ?, ?, ?, 12, ?)`,
            args: [item.sticker_id, cc, item.rank, date, now],
          },
        ]);

        if (statements.length) await client.batch(statements, 'write');
        console.log(`${items.length} items`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
      await sleep(400);
    }
  }

  const [pr, rr] = await Promise.all([
    client.execute('SELECT COUNT(*) AS n FROM products'),
    client.execute('SELECT COUNT(*) AS n FROM rankings'),
  ]);
  console.log(`\nDone!`);
  console.log(`  Products: ${pr.rows[0].n}`);
  console.log(`  Ranking rows: ${rr.rows[0].n}`);
}

main().catch(err => { console.error(err); process.exit(1); });
