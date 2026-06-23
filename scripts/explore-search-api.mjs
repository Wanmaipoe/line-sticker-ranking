/**
 * Test search and sticker lookup on linesticker.app
 * Run: node scripts/explore-search-api.mjs
 */

const BASE = 'https://linesticker.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) return { error: `non-json: ${res.status}` };
  return res.json();
}

// 1. Search by query name
console.log('=== Search by name ===');
const searchTests = [
  `${BASE}/api/stickers?q=tangkwa&limit=5`,
  `${BASE}/api/stickers?search=tangkwa&limit=5`,
  `${BASE}/api/stickers?query=tangkwa&limit=5`,
  `${BASE}/api/stickers?title=tangkwa&limit=5`,
  `${BASE}/api/stickers?name=tangkwa&limit=5`,
];
for (const url of searchTests) {
  const d = await getJson(url);
  const param = url.split('?')[1].split('&')[0];
  if (d.data?.length) {
    console.log(`✓ ${param}: ${d.data.length} results, first="${d.data[0].title}"`);
  } else {
    console.log(`✗ ${param}: ${JSON.stringify(d).slice(0, 80)}`);
  }
  await new Promise(r => setTimeout(r, 200));
}

// 2. Find what params /api/stickers really accepts (full response meta)
console.log('\n=== /api/stickers meta ===');
const full = await getJson(`${BASE}/api/stickers?limit=1`);
console.log('meta:', JSON.stringify(full.meta));
console.log('keys:', Object.keys(full));

// 3. Try to get all countries from a rankings call to know supported list
console.log('\n=== Available countries from /api/rankings ===');
const extraCodes = ['cn', 'in', 'br', 'mx', 'au', 'fr', 'de', 'ar', 'sa'];
const today = '2026-06-23';
for (const cc of extraCodes) {
  const d = await getJson(`${BASE}/api/rankings?country=${cc}&date=${today}&limit=1`);
  if (d.data?.length) console.log(`✓ ${cc}: has data`);
  else console.log(`✗ ${cc}: ${JSON.stringify(d).slice(0, 60)}`);
  await new Promise(r => setTimeout(r, 200));
}

// 4. Check pagination on rankings
console.log('\n=== Rankings pagination (TH, offset/page) ===');
const p1 = await getJson(`${BASE}/api/rankings?country=th&date=${today}&limit=10&offset=0`);
const p2 = await getJson(`${BASE}/api/rankings?country=th&date=${today}&limit=10&offset=10`);
const p3 = await getJson(`${BASE}/api/rankings?country=th&date=${today}&limit=10&page=2`);
console.log('offset=0 first id:', p1.data?.[0]?.sticker_id, 'count:', p1.data?.length);
console.log('offset=10 first id:', p2.data?.[0]?.sticker_id, 'count:', p2.data?.length);
console.log('page=2 first id:', p3.data?.[0]?.sticker_id, 'count:', p3.data?.length);
