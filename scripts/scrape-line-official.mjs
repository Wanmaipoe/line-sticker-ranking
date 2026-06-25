// Scrapes the REAL LINE official creator-sticker ranking from store.line.me.
//
// Key discovery: store.line.me/stickershop/showcase/top_creators/<lang>?country=XX
// returns the per-country ranking based on the ?country= param (NOT the IP, NOT
// the <lang> path). This lets us pull all 18 countries from a single IP, hourly,
// matching LINE's ~xx:28 update — strictly fresher than linesticker.app (daily).
//
// Usage:
//   node scripts/scrape-line-official.mjs --dry      # fetch TH page 1, print parsed items + HTML dump, NO db write
//   node scripts/scrape-line-official.mjs            # full run, all countries, writes to Turso

import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const DRY = process.argv.includes('--dry');

// Load .env.local for local runs (Task Scheduler / dev). In CI the env is already set.
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
  // not local
}

const BASE = 'https://store.line.me';
// LINE's meaningful markets only (by MAU). Other countries have too few users to
// produce a trustworthy ranking, so we don't collect them. Order = priority.
const ALL_COUNTRIES = ['jp', 'th', 'tw', 'id', 'us'];
// ONLY=th,jp limits the run (testing / re-scrape a single country). Default: all.
const COUNTRIES = process.env.ONLY
  ? process.env.ONLY.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
  : ALL_COUNTRIES;
const MAX_RANK = parseInt(process.env.MAX_RANK ?? '500', 10);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://store.line.me/',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry transient failures (network blips, and the WiFi-not-up-yet window right after
// the laptop wakes to run the scheduled task — the cause of "ran but wrote nothing").
async function fetchWithRetry(url, opts, attempts = 4, baseDelay = 2500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(baseDelay * (i + 1)); // 2.5s, 5s, 7.5s
    }
  }
  throw lastErr;
}

// Don't start scraping until the network is actually reachable. After a wake-to-run,
// the task can fire before WiFi reconnects; without this the whole run fails silently.
async function waitForNetwork(maxWaitMs = 90000) {
  const probe = `${BASE}/stickershop/showcase/top_creators/en?country=JP&page=1`;
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(probe, { headers: HEADERS });
      if (res.ok) return true;
    } catch {
      // not reachable yet
    }
    attempt += 1;
    console.log(`[scraper] network not ready, waiting 5s... (attempt ${attempt})`);
    await sleep(5000);
  }
  return false;
}

async function fetchPage(country, page) {
  const url = `${BASE}/stickershop/showcase/top_creators/en?country=${country.toUpperCase()}&page=${page}`;
  const res = await fetchWithRetry(url, { headers: HEADERS });
  return res.text();
}

// Parse one showcase page into ordered items. Anchored on the stable product link
// (/stickershop/product/<id>) so it survives CSS class churn. Dedupes by id,
// preserving first-seen order (= rank order).
function parsePage(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href*="/stickershop/product/"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const m = href.match(/\/stickershop\/product\/(\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);

    const $img = $a.find('img').first();
    let image = $img.attr('data-src') || $img.attr('src') || null;
    // Premium/subscription stickers list a generic "P" placeholder instead of a real
    // thumbnail. Drop anything that isn't a product image; the UI then builds the
    // canonical thumbnail URL from the product id (which works for premium too).
    if (image && !image.includes('/stickershop/')) image = null;
    const imgAlt = ($img.attr('alt') || '').trim();

    // Title + author usually sit in sibling text nodes inside the card.
    const title = ($a.find('.mdCMN05Ttl, .mdCMN09Ttl, [class*="Ttl"]').first().text() || '').trim();
    const author = ($a.find('.mdCMN05Author, .mdCMN09Author, [class*="Author"]').first().text() || '').trim();
    const fullText = $a.text().trim().replace(/\s+/g, ' ');

    // Sticker type comes free from a list icon (e.g. data-test="animation-sticker-icon").
    // No icon = static. Catches animation / popup / sound without an extra fetch.
    let stickerType = 'static';
    const dt = $a.find('[data-test$="-sticker-icon"]').first().attr('data-test');
    if (dt) {
      stickerType = dt.replace(/-sticker-icon$/, '');
    } else {
      const cls = $a.find('span[class*="MdIco"]').first().attr('class') || '';
      if (/Play/i.test(cls)) stickerType = 'animation';
      else if (/Popup/i.test(cls)) stickerType = 'popup';
      else if (/Sound/i.test(cls)) stickerType = 'sound';
    }

    items.push({
      id,
      name: title || imgAlt || fullText || null,
      author: author || null,
      image,
      stickerType,
      _rawText: fullText,
    });
  });

  return items;
}

async function getCountryRanking(country) {
  const all = [];
  const seen = new Set();
  for (let page = 1; all.length < MAX_RANK; page++) {
    let items;
    try {
      const html = await fetchPage(country, page);
      items = parsePage(html);
    } catch (err) {
      console.error(`[${country}] page ${page} error: ${err.message}`);
      break;
    }
    const fresh = items.filter((it) => !seen.has(it.id));
    if (fresh.length === 0) break; // reached the end
    for (const it of fresh) {
      seen.add(it.id);
      all.push({ ...it, rank: all.length + 1 });
      if (all.length >= MAX_RANK) break;
    }
    await sleep(350);
  }
  return all;
}

async function runDry() {
  console.log('=== DRY RUN: TH page 1 ===\n');
  const html = await fetchPage('th', 1);
  const $ = cheerio.load(html);

  const items = parsePage(html);
  console.log(`Parsed ${items.length} items on page 1\n`);
  console.log('First 10:');
  for (let i = 0; i < Math.min(10, items.length); i++) {
    const it = items[i];
    console.log(`  #${i + 1}  id=${it.id}  name="${it.name}"  author="${it.author}"`);
  }

  // Dump the outer HTML of the first product anchor so we can verify name/author selectors.
  const firstAnchor = $('a[href*="/stickershop/product/"]').first();
  console.log('\n--- Outer HTML of first product anchor (for selector tuning) ---');
  console.log($.html(firstAnchor).slice(0, 1500));
}

async function runFull() {
  const { createClient } = await import('@libsql/client');
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    process.exit(1);
  }
  const client = createClient({ url, authToken });

  // Wait for connectivity before doing anything (handles wake-to-run before WiFi is up).
  if (!(await waitForNetwork())) {
    console.error('[scraper] network unavailable after 90s — aborting, the next run will retry');
    process.exit(1);
  }

  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10); // UTC date, matches existing convention
  const hour = now.getUTCHours();
  const nowIso = now.toISOString();
  const summary = {};

  for (const country of COUNTRIES) {
    try {
      const ranking = await getCountryRanking(country);
      if (!ranking.length) {
        summary[country] = { items: 0 };
        console.log(`[scraper] ${country}: 0 items`);
        continue;
      }

      // Clear this snapshot first so a re-run within the same hour can't leave stale
      // rows for stickers that dropped out of the top N (otherwise = duplicate ranks).
      const statements = [
        {
          sql: `DELETE FROM rankings WHERE country = ? AND snapshot_date = ? AND snapshot_hour = ?`,
          args: [country, snapshotDate, hour],
        },
      ];
      statements.push(...ranking.flatMap((item) => [
        {
          sql: `INSERT INTO products (id, name, image_url, author, sticker_type, price, price_currency, description, updated_at)
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  image_url = COALESCE(excluded.image_url, products.image_url),
                  author = COALESCE(excluded.author, products.author),
                  sticker_type = COALESCE(excluded.sticker_type, products.sticker_type),
                  updated_at = excluded.updated_at`,
          args: [item.id, item.name ?? item.id, item.image ?? null, item.author ?? null, item.stickerType ?? null, nowIso],
        },
        {
          sql: `INSERT OR REPLACE INTO rankings (product_id, country, rank, snapshot_date, snapshot_hour, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [item.id, country, item.rank, snapshotDate, hour, nowIso],
        },
      ]));

      await client.batch(statements, 'write');
      summary[country] = { items: ranking.length };
      console.log(`[scraper] ${country} ${snapshotDate} h${hour}: ${ranking.length} items`);
    } catch (err) {
      summary[country] = { items: 0, error: err.message };
      console.error(`[scraper] ${country} error: ${err.message}`);
    }
    await sleep(400);
  }

  console.log('\n[scraper] Done:', JSON.stringify(summary, null, 2));

  // If every country came back empty, the run effectively failed — exit non-zero so it
  // shows up as a failed task (not a silent "success") and isn't mistaken for fresh data.
  const totalItems = Object.values(summary).reduce((n, s) => n + (s.items || 0), 0);
  if (totalItems === 0) {
    console.error('[scraper] wrote 0 items across all countries — exiting non-zero');
    process.exit(1);
  }
}

(DRY ? runDry() : runFull()).catch((err) => {
  console.error(err);
  process.exit(1);
});
