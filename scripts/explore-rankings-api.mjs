/**
 * Explore /api/rankings and /api/dates on linesticker.app
 * Run: node scripts/explore-rankings-api.mjs
 */

const BASE = 'https://linesticker.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return { error: res.status };
  return res.json();
}

// 1. Try different country codes on /api/rankings
const countryCodes = ['th', 'jp', 'tw', 'kr', 'id', 'my', 'sg', 'hk', 'ph', 'vn', 'us', 'gb'];
const today = '2026-06-23';

console.log('=== Testing /api/rankings per country ===');
for (const cc of countryCodes) {
  const url = `${BASE}/api/rankings?country=${cc}&date=${today}`;
  const data = await getJson(url);
  if (data.error) {
    console.log(`${cc}: HTTP ${data.error}`);
  } else if (data.data?.length) {
    const top3 = data.data.slice(0, 3).map(d => `#${d.rank} ${d.sticker_id}`).join(' | ');
    console.log(`${cc}: ${data.data.length} items — ${top3}`);
  } else {
    console.log(`${cc}: empty`, JSON.stringify(data).slice(0, 100));
  }
  await new Promise(r => setTimeout(r, 300));
}

// 2. Check /api/dates for available dates
console.log('\n=== /api/dates?country=th ===');
const dates = await getJson(`${BASE}/api/dates?country=th`);
console.log(JSON.stringify(dates).slice(0, 400));

// 3. Check meta for pagination
console.log('\n=== /api/rankings TH meta + limit ===');
const ranked = await getJson(`${BASE}/api/rankings?country=th&date=${today}&limit=50`);
console.log('meta:', JSON.stringify(ranked.meta));
console.log('total items:', ranked.data?.length);

// 4. Try sticker-specific lookup (by sticker_id)
const sampleId = '34019392'; // Tangkwa
console.log(`\n=== /api/stickers search for ${sampleId} ===`);
const byId = await getJson(`${BASE}/api/stickers?sticker_id=${sampleId}`);
console.log(JSON.stringify(byId).slice(0, 400));

// 5. Try history for a specific sticker across countries
console.log(`\n=== /api/rankings history for sticker ${sampleId} ===`);
const hist = await getJson(`${BASE}/api/rankings?sticker_id=${sampleId}&country=th`);
console.log(JSON.stringify(hist).slice(0, 400));
