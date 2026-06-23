/**
 * Test the local Next.js API endpoints.
 * Run: node scripts/test-api.mjs
 * (Make sure npm run dev is running first)
 */

const BASE = 'http://localhost:3000';

async function get(path, label) {
  console.log(`\n--- ${label} ---`);
  try {
    const res = await fetch(`${BASE}${path}`);
    const json = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(json).slice(0, 300));
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

// 1. Search for a sticker
await get('/api/search?q=Tangkwa', 'Search "Tangkwa"');

// 2. Search for something Japanese
await get('/api/search?q=Chiikawa', 'Search "Chiikawa"');

// 3. Get rankings for a known sticker (Tangkwa ID from TH ranking)
await get('/api/sticker/34019392', 'Rankings for Tangkwa (34019392)');

// 4. Get history for TH
await get('/api/sticker/34019392/history?country=th&days=30', 'History TH for Tangkwa');
