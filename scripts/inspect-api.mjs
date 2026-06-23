// Check what fields linesticker.app actually returns
const BASE = 'https://linesticker.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  return res.json();
}

// Check rankings endpoint (1 item)
console.log('\n=== /api/rankings (first item, all fields) ===');
const rankings = await apiFetch('/api/rankings?country=th&date=2026-06-23&limit=1&offset=0');
console.log(JSON.stringify(rankings.data?.[0], null, 2));

// Check stickers search endpoint
console.log('\n=== /api/stickers (first item, all fields) ===');
const stickers = await apiFetch('/api/stickers?q=chiikawa&limit=1');
console.log(JSON.stringify(stickers.data?.[0], null, 2));
