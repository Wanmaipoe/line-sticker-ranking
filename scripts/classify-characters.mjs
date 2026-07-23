/**
 * Daily character classifier. Labels each currently-ranked sticker (jp/th/tw top-500) that has no
 * character_type yet, using Cloudflare Workers AI (Moondream 3.1 vision) — an open "what is this?"
 * prompt, then a local keyword map onto our buckets.
 *
 * Cost: Moondream ~21.5 neurons/image; the Workers AI free tier is 10,000 neurons/day, so
 * MAX_PER_RUN defaults to 450 (≈ the free ceiling). A first-time backfill of the current ~1,455
 * ranked packs therefore drains over ~4 days for free, then only the ~340 new-per-day flow remains,
 * which fits comfortably in one day's free quota. Set MAX_PER_RUN higher to spend paid overage.
 *
 * Never touches a row where character_source='manual' (an admin correction) or one that already has
 * a character_type — so it only ever pays to classify genuinely-new packs.
 *
 * Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, CF_ACCOUNT_ID, CF_API_TOKEN, optional MAX_PER_RUN.
 * Run: node scripts/classify-characters.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Load .env.local for local runs (CI already has the env set).
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

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TOKEN = process.env.CF_API_TOKEN;
// Strip any trailing path (people paste ".../<id>/home" from the dashboard URL) and validate.
const ACCOUNT = (process.env.CF_ACCOUNT_ID || '').trim().split('/')[0];
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 450);
const COUNTRIES = ['jp', 'th', 'tw'];

if (!TURSO_URL) { console.error('✗ Missing TURSO_DATABASE_URL'); process.exit(1); }
if (!TOKEN || !/^[0-9a-f]{32}$/i.test(ACCOUNT)) {
  console.error('✗ Missing/invalid CF_API_TOKEN or CF_ACCOUNT_ID (must be a 32-char hex id, no "/home")');
  process.exit(1);
}

const client = createClient({ url: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const cfBase = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai`;
const thumbUrl = (id) => `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`;

// Map Moondream's free-text answer → a character key. KEEP KEYS IN SYNC with lib/characters.ts
// (CHARACTER_KEYS). Order matters: specific first, and "hot dog" before "dog".
function mapBucket(text) {
  const t = ' ' + String(text).toLowerCase() + ' ';
  if (/hot ?dog|corn dog/.test(t)) return 'food';
  if (/rabbits?|bunn(y|ies)|hares?/.test(t)) return 'rabbit';
  if (/hamsters?/.test(t)) return 'hamster';
  if (/pandas?/.test(t)) return 'panda';
  if (/kittens?|kitty|\bcats?\b|feline/.test(t)) return 'cat';
  if (/puppy|puppies|corgis?|shibas?|\bdogs?\b|\bpups?\b/.test(t)) return 'dog';
  if (/teddy|\bbears?\b/.test(t)) return 'bear';
  if (/ducks?|penguins?|parrots?|\bowls?\b|sparrows?|chicks?|\bbirds?\b/.test(t)) return 'bird';
  if (/persons?|humans?|\bm[ae]n\b|wom[ae]n|\bgirls?\b|\bboys?\b|people|lady|ladies|\bguys?\b|geisha/.test(t)) return 'human';
  if (/coffee|sausage|bread|cake|fruit|burger|pizza|noodles?|ramen|drinks?|\bfoods?\b|meal/.test(t)) return 'food';
  return 'other';
}

const QUESTION =
  'In one to four words, what is the main character or subject of this sticker? ' +
  'Name the specific animal, creature, person, or object.';

async function discoverModel() {
  const r = await fetch(`${cfBase}/models/search?search=moondream`, { headers: AUTH });
  const j = await r.json().catch(() => ({}));
  const models = (r.ok && j.success && j.result) || [];
  const m = models.find((x) => /moondream/i.test(x.name)) || models[0];
  if (!m) throw new Error('No Moondream model available on this Cloudflare account');
  return m.name;
}

async function classify(model, id) {
  const imgRes = await fetch(thumbUrl(id));
  if (!imgRes.ok) return null;
  const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
  const r = await fetch(`${cfBase}/run/${model}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/png;base64,${b64}`,
      task: 'query',
      question: QUESTION,
      reasoning: false, // default true → wasted output tokens
      stream: false, // default true → SSE; must be false to read JSON
      max_tokens: 64,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) return null;
  const answer = String(j.result?.result?.answer ?? j.result?.answer ?? '').trim();
  // An empty (but "successful") answer would map to 'other' and be locked in forever. Treat it as a
  // soft failure instead: return null so the row stays NULL (unclassified) and is retried next run.
  if (!answer) return null;
  const neurons = Number(j.result?.usage?.neurons ?? 0);
  return { bucket: mapBucket(answer), answer, neurons };
}

// ── 1. collect currently-ranked product ids (latest snapshot per country) ────
const ranked = new Set();
for (const cc of COUNTRIES) {
  const snap = await client.execute({
    sql: `SELECT snapshot_date d, snapshot_hour h FROM rankings WHERE country=? ORDER BY snapshot_date DESC, snapshot_hour DESC LIMIT 1`,
    args: [cc],
  });
  if (!snap.rows[0]) continue;
  const members = await client.execute({
    sql: `SELECT product_id p FROM rankings WHERE country=? AND snapshot_date=? AND snapshot_hour=?`,
    args: [cc, String(snap.rows[0].d), Number(snap.rows[0].h)],
  });
  for (const row of members.rows) ranked.add(String(row.p));
}

// ── 2. of those, find the ones not yet classified ───────────────────────────
const ids = [...ranked];
const candidates = [];
for (let i = 0; i < ids.length; i += 400) {
  const chunk = ids.slice(i, i + 400);
  const ph = chunk.map(() => '?').join(',');
  const r = await client.execute({
    sql: `SELECT id, character_type FROM products WHERE id IN (${ph})`,
    args: chunk,
  });
  for (const row of r.rows) if (row.character_type == null) candidates.push(String(row.id));
}

console.log(`ranked packs: ${ranked.size} | unclassified: ${candidates.length} | this run caps at ${MAX_PER_RUN}`);

// ── 3. classify up to MAX_PER_RUN, write (never overwrite a manual correction) ─
const model = await discoverModel();
console.log(`model: ${model}\n`);

let done = 0, skipped = 0, neurons = 0;
const dist = {};
for (const id of candidates.slice(0, MAX_PER_RUN)) {
  const out = await classify(model, id);
  if (!out) { skipped++; continue; }
  await client.execute({
    sql: `UPDATE products SET character_type=?, character_source='ai'
          WHERE id=? AND (character_source IS NULL OR character_source <> 'manual')`,
    args: [out.bucket, id],
  });
  done++;
  neurons += out.neurons;
  dist[out.bucket] = (dist[out.bucket] ?? 0) + 1;
  if (done % 25 === 0) console.log(`  ${done} classified...`);
}

const remaining = Math.max(0, candidates.length - MAX_PER_RUN);
console.log(`\n=== DONE === classified ${done}, skipped ${skipped}, neurons used ${neurons.toFixed(0)} / 10,000 free`);
console.log('distribution:', Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join('  '));
if (remaining > 0) console.log(`backlog: ${remaining} packs left — the next daily run continues (free).`);
