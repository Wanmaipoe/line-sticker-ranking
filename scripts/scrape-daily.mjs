import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local for local testing
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // Not local — running in GitHub Actions with env vars already set
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://linesticker.app/',
  'Origin': 'https://linesticker.app',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

const BASE = 'https://linesticker.app';
const COUNTRIES = ['jp', 'th', 'tw', 'id', 'us', 'kr', 'my', 'sg', 'hk', 'ph', 'vn', 'in', 'au', 'br', 'mx', 'sa', 'ae', 'eg'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`success=false for ${path}`);
  return json;
}

async function getAvailableDates(country) {
  const r = await apiFetch(`/api/dates?country=${country}`);
  return r.data;
}

async function getRankingsPage(country, date, limit = 50, offset = 0) {
  const r = await apiFetch(`/api/rankings?country=${country}&date=${date}&limit=${limit}&offset=${offset}`);
  return { data: r.data, hasMore: r.meta.hasMore };
}

async function getAllRankings(country, date) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, hasMore } = await getRankingsPage(country, date, 50, offset);
    all.push(...data);
    if (!hasMore) break;
    offset += 50;
    await sleep(300);
  }
  return all;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    process.exit(1);
  }

  const client = createClient({ url, authToken });
  const hour = new Date().getUTCHours();
  const now = new Date().toISOString();
  const summary = {};

  for (const country of COUNTRIES) {
    try {
      const dates = await getAvailableDates(country);
      if (!dates.length) { summary[country] = { items: 0 }; continue; }

      const latestDate = dates[0];
      const items = await getAllRankings(country, latestDate);

      const statements = items.flatMap((item) => [
        {
          sql: `INSERT INTO products (id, name, image_url, author, price, price_currency, description, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  image_url = excluded.image_url,
                  author = COALESCE(excluded.author, products.author),
                  price = COALESCE(excluded.price, products.price),
                  price_currency = COALESCE(excluded.price_currency, products.price_currency),
                  description = COALESCE(excluded.description, products.description),
                  updated_at = excluded.updated_at`,
          args: [item.sticker_id, item.title, item.image_url ?? null, item.author ?? null,
                 item.price ?? null, item.price_currency ?? null, item.description ?? null, now],
        },
        {
          sql: `INSERT OR REPLACE INTO rankings (product_id, country, rank, snapshot_date, snapshot_hour, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [item.sticker_id, country, item.rank, latestDate, hour, now],
        },
      ]);

      if (statements.length) {
        await client.batch(statements, 'write');
      }

      summary[country] = { date: latestDate, items: items.length };
      console.log(`[scraper] ${country} ${latestDate}: ${items.length} items`);
    } catch (err) {
      summary[country] = { items: 0, error: err.message };
      console.error(`[scraper] ${country} error: ${err.message}`);
    }
    await sleep(400);
  }

  console.log('\n[scraper] Done:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
