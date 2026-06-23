/**
 * Explore linesticker.app structure to find scrapeable data.
 * Run: node scripts/explore-linesticker-app.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url, label) {
  console.log(`\n--- ${label} ---`);
  console.log(`GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html, */*' },
    });
    console.log('Status:', res.status, res.headers.get('content-type'));
    const text = await res.text();
    // Print first 800 chars to understand structure
    console.log(text.slice(0, 800));
    return { status: res.status, text };
  } catch (err) {
    console.log('ERROR:', err.message);
    return null;
  }
}

// 1. Try the main page with country+date params
await get('https://linesticker.app/?country=th&date=2026-06-23', 'Main page TH today');

// 2. Try guessing JSON API endpoints
await get('https://linesticker.app/api/ranking?country=th&date=2026-06-23', 'API /api/ranking');
await get('https://linesticker.app/api/stickers?country=th', 'API /api/stickers');
await get('https://linesticker.app/api/top?country=th', 'API /api/top');

// 3. Try country list page
await get('https://linesticker.app/api/countries', 'API /api/countries');

// 4. Try Next.js data routes (common pattern for Next.js apps)
await get('https://linesticker.app/_next/data/BUILD_ID/index.json?country=th', 'Next.js data route');
