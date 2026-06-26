// Backfills static per-product details that the hourly ranking page doesn't carry:
//   author, author_id, price, price_currency, description, sticker_type
//
// Source: the product detail page's embedded ld+json (schema.org Product) plus the
// per-sticker data-preview "type". These never change, so this runs separately from
// the hourly scraper — daily, or on demand. It only touches products missing details.
//
// Usage:
//   node scripts/backfill-details.mjs            # backfill up to BACKFILL_LIMIT (default 400) products
//   BACKFILL_LIMIT=50 node scripts/backfill-details.mjs
//   REFRESH=1 node scripts/backfill-details.mjs  # re-fetch ALL products, not just missing ones

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
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const LIMIT = parseInt(process.env.BACKFILL_LIMIT ?? '600', 10);
const REFRESH = process.env.REFRESH === '1';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://store.line.me/',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPE_PRIORITY = ['popup_sound', 'popup', 'sound', 'animation', 'effect', 'name', 'static'];

function parseDetail(html) {
  const out = { name: null, description: null, price: null, price_currency: null, author: null, author_id: null, sticker_type: null };

  // ld+json (schema.org Product) — the clean structured source
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const data = JSON.parse(ld[1].trim());
      out.name = data.name ?? null;
      out.description = data.description ?? null;
      const offer = data.offers ?? {};
      // Stored as cents (USD) so $0.99 survives the INTEGER column. Display divides by 100.
      if (offer.price != null && offer.price !== '') out.price = Math.round(parseFloat(offer.price) * 100);
      out.price_currency = offer.priceCurrency ?? null;
      const seller = offer.seller ?? {};
      out.author = seller.name ?? null;
      const am = (seller.url ?? '').match(/\/author\/(\d+)/);
      if (am) out.author_id = am[1];
    } catch {
      // fall through to regex below
    }
  }

  // Fallbacks if ld+json was malformed
  if (out.price == null) {
    const pm = html.match(/&quot;price&quot;\s*:\s*&quot;?([\d.]+)/) || html.match(/"price"\s*:\s*"?([\d.]+)/);
    if (pm) out.price = Math.round(parseFloat(pm[1]) * 100);
  }
  if (!out.author_id) {
    const am = html.match(/\/stickershop\/author\/(\d+)/);
    if (am) out.author_id = am[1];
  }

  // sticker type from per-sticker data-preview (HTML-entity encoded quotes)
  const typeMatches = [...html.matchAll(/&quot;type&quot;\s*:\s*&quot;(\w+)&quot;/g)].map((m) => m[1].toLowerCase());
  if (typeMatches.length) {
    for (const t of TYPE_PRIORITY) {
      if (typeMatches.includes(t)) { out.sticker_type = t; break; }
    }
    if (!out.sticker_type) out.sticker_type = typeMatches[0];
  }

  return out;
}

async function main() {
  // Price is per-country, so we pin country=US for a canonical USD price. Re-fetch
  // anything not yet in USD (catches the early no-param rows that came back in KRW etc).
  const where = REFRESH ? '' : "WHERE author_id IS NULL OR price IS NULL OR price_currency IS NULL OR price_currency != 'USD'";
  // Always backfill CURRENTLY-RANKED products first (the ones users actually see), then
  // the rest by recency. Otherwise a large historical backlog can crowd out new stickers.
  const res = await client.execute({
    sql: `SELECT id FROM products p ${where}
          ORDER BY
            (EXISTS (SELECT 1 FROM rankings r WHERE r.product_id = p.id
                     AND r.snapshot_date = (SELECT MAX(snapshot_date) FROM rankings))) DESC,
            updated_at DESC
          LIMIT ?`,
    args: [LIMIT],
  });
  const ids = res.rows.map((r) => r.id);
  console.log(`${ids.length} products to backfill (REFRESH=${REFRESH})`);

  let ok = 0, fail = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const r = await fetch(`https://store.line.me/stickershop/product/${id}/en?country=US`, { headers: HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const d = parseDetail(html);

      await client.execute({
        sql: `UPDATE products SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                price = COALESCE(?, price),
                price_currency = COALESCE(?, price_currency),
                author = COALESCE(?, author),
                author_id = COALESCE(?, author_id),
                sticker_type = COALESCE(?, sticker_type)
              WHERE id = ?`,
        args: [d.name, d.description, d.price, d.price_currency, d.author, d.author_id, d.sticker_type, id],
      });
      ok++;
      if (i < 5 || i % 50 === 0) {
        console.log(`  ${id}: author="${d.author}" price=${d.price}${d.price_currency ?? ''} type=${d.sticker_type}`);
      }
    } catch (err) {
      fail++;
      console.error(`  ${id} error: ${err.message}`);
    }
    await sleep(300);
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
