// IndexNow: after each hourly scrape, tell Bing (and other IndexNow engines) that our
// hourly-updated aggregate pages changed, so they re-crawl promptly instead of on their own slow
// schedule. This is a big lever for AI answer engines that source from Bing (ChatGPT / Copilot /
// Perplexity). We only submit the handful of pages that actually change every hour — NOT the ~17k
// sticker pages (that would be spammy and pointless). Zero Turso reads; it's just an HTTP POST.
//
// The key is public at https://linestickerranking.com/<KEY>.txt (a file in public/), which proves
// we own the domain. Run from the scraper GitHub Action after the scrape step.

const HOST = 'linestickerranking.com';
const KEY = 'd5056a67477a237f5f9c289f83f3f45d';
const BASE = `https://${HOST}`;

const urlList = [
  `${BASE}/`,
  `${BASE}/country/jp`,
  `${BASE}/country/th`,
  `${BASE}/country/tw`,
  `${BASE}/creators`,
];

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `${BASE}/${KEY}.txt`,
  urlList,
};

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // IndexNow returns 200 or 202 on success; other codes are informational, not fatal to the scrape.
  console.log(`[IndexNow] submitted ${urlList.length} URLs → HTTP ${res.status}`);
} catch (e) {
  console.log(`[IndexNow] ping failed (non-fatal): ${e.message}`);
}
process.exit(0);
