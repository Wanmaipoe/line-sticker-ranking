/**
 * Test whether LINE Store respects cookie/header-based country switching.
 * Run: node scripts/test-country-cookie.mjs
 */

const tests = [
  {
    label: 'TH (no override, baseline)',
    url: 'https://store.line.me/stickershop/showcase/top_creators/th',
    headers: {},
  },
  {
    label: 'JA + JP cookie',
    url: 'https://store.line.me/stickershop/showcase/top_creators/ja',
    headers: {
      Cookie: 'lang=ja; countryCode=JP; COUNTRY=JP',
      'Accept-Language': 'ja-JP,ja;q=0.9',
    },
  },
  {
    label: 'KO + KR cookie',
    url: 'https://store.line.me/stickershop/showcase/top_creators/ko',
    headers: {
      Cookie: 'lang=ko; countryCode=KR; COUNTRY=KR',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function extractIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\/stickershop\/product\/(\d+)\//g)) {
    ids.add(m[1]);
  }
  return [...ids].slice(0, 5);
}

for (const t of tests) {
  try {
    const res = await fetch(t.url, {
      headers: { 'User-Agent': UA, ...t.headers },
    });
    const html = await res.text();
    const ids = extractIds(html);
    console.log(`[${t.label}] status=${res.status} ids=${ids.join(', ')}`);
  } catch (err) {
    console.error(`[${t.label}] ERROR: ${err.message}`);
  }
}
