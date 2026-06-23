/**
 * Deep explore linesticker.app API to find ranking endpoints.
 * Run: node scripts/explore-linesticker-ranking.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url, label) {
  console.log(`\n--- ${label} ---`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/html, */*' },
    });
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      const json = await res.json();
      console.log(`Status: ${res.status} (JSON)`);
      // Show structure + first item
      if (Array.isArray(json)) {
        console.log(`Array[${json.length}], first item keys:`, Object.keys(json[0] ?? {}));
        console.log('First item:', JSON.stringify(json[0], null, 2).slice(0, 400));
      } else {
        const keys = Object.keys(json);
        console.log('Keys:', keys);
        if (json.data) {
          const d = json.data;
          if (Array.isArray(d)) {
            console.log(`data Array[${d.length}], first item keys:`, Object.keys(d[0] ?? {}));
            console.log('First item:', JSON.stringify(d[0], null, 2).slice(0, 400));
          }
        }
      }
    } else {
      const text = await res.text();
      console.log(`Status: ${res.status} (HTML/other), length=${text.length}`);
      // Look for any JSON data embedded in HTML
      const scriptDataMatch = text.match(/__NEXT_DATA__\s*=\s*({.+?})\s*<\/script>/s);
      if (scriptDataMatch) console.log('Found __NEXT_DATA__:', scriptDataMatch[1].slice(0, 300));
      // Look for fetch/api calls in script tags
      const apiMatches = [...text.matchAll(/["'](\/api\/[^"']+)["']/g)].map(m => m[1]);
      if (apiMatches.length) console.log('API paths found in HTML:', [...new Set(apiMatches)]);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

// Explore /api/stickers more deeply
await get('https://linesticker.app/api/stickers?country=th&limit=3', '/api/stickers TH limit=3');
await get('https://linesticker.app/api/stickers?country=jp&limit=3', '/api/stickers JP limit=3');

// Try ranking-specific endpoints with various guesses
await get('https://linesticker.app/api/rankings?country=th&date=2026-06-23', '/api/rankings');
await get('https://linesticker.app/api/rank?country=th&date=2026-06-23', '/api/rank');
await get('https://linesticker.app/api/stickers/ranking?country=th', '/api/stickers/ranking');
await get('https://linesticker.app/api/daily?country=th&date=2026-06-23', '/api/daily');

// Also try fetching the HTML page and look for embedded API calls
await get('https://linesticker.app/?country=th&date=2026-06-23&q=', 'HTML page (look for API refs)');
