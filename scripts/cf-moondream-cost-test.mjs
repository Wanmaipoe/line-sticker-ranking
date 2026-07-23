// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Moondream — cost + accuracy probe  (self-discovering; safe to delete)
//
// Fixes the previous "No route for that URI" (code 7000): instead of hardcoding a
// model slug that may not match, this asks YOUR account which vision models exist
// (models-search endpoint) and uses the exact name it returns.
//
// SETUP: .env.local (already gitignored) must contain:
//   CF_ACCOUNT_ID=xxxx
//   CF_API_TOKEN=xxxx   (Workers AI Read+Edit)
// RUN from the repo root:
//   node --env-file=.env.local scripts/cf-moondream-cost-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = process.env.CF_API_TOKEN;
// Account ID guard: people copy ".../<id>/home" straight from the dashboard URL, so
// strip any trailing path (the "/home" that caused every call to 404) and validate.
let ACCOUNT = (process.env.CF_ACCOUNT_ID || '').trim().split('/')[0];
if (!TOKEN) { console.error('✗ Missing CF_API_TOKEN in .env.local'); process.exit(1); }
if (!/^[0-9a-f]{32}$/i.test(ACCOUNT)) {
  console.error(`✗ CF_ACCOUNT_ID looks wrong: "${process.env.CF_ACCOUNT_ID}"`);
  console.error('  It must be the 32-character hex string only (no "/home", no slashes).');
  process.exit(1);
}
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai`;

// ── Step 1: discover which model to call ─────────────────────────────────────
async function search(qs) {
  const r = await fetch(`${base}/models/search?${qs}`, { headers: AUTH });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) {
    console.error(`  models-search failed (HTTP ${r.status}):`, JSON.stringify(j.errors ?? j).slice(0, 300));
    return null;
  }
  return j.result ?? [];
}

console.log('=== Step 1: find the real vision model on your account ===');
let models = await search('search=moondream');
if (models && models.length) {
  console.log('  Moondream models found:');
  for (const m of models) console.log(`    ${m.name}   [task: ${m.task?.name ?? '?'}]`);
}
// Fallback: if no moondream, list ALL image-to-text (vision) models so we can pick one.
if (!models || !models.length) {
  console.log('  No "moondream" match. Listing all Image-to-Text vision models instead:');
  const vis = await search('task=Image-to-Text&per_page=50');
  if (vis && vis.length) for (const m of vis) console.log(`    ${m.name}   [${m.task?.name}]`);
  else console.log('    (none returned — token may lack Workers AI read, or account has no vision models)');
  console.log('\n✗ Could not auto-pick a model. Paste the list above to me and I\'ll set the exact one.');
  process.exit(1);
}

// Prefer a moondream vision model; else first result.
const chosen =
  models.find((m) => /moondream/i.test(m.name) && /image|vision/i.test(m.task?.name ?? '')) ||
  models.find((m) => /moondream/i.test(m.name)) ||
  models[0];
const MODEL = chosen.name;
console.log(`\n  → using: ${MODEL}\n`);

// ── Step 2: classify 12 real stickers ────────────────────────────────────────
const IDS = ['33799640', '35143333', '27489190', '26357323', '34642714', '35306649',
  '35226490', '1000085', '1000281', '1000395', '1000439', '1000509'];
const thumbUrl = (id) => `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`;
const runUrl = `${base}/run/${MODEL}`;
// OPEN question — no option list (the old forced-choice list biased it toward "cat").
// Let Moondream name what it sees; we map to our buckets locally afterward.
const QUESTION =
  'In one to four words, what is the main character or subject of this sticker? ' +
  'Name the specific animal, creature, person, or object.';

// Map Moondream's free-text description → our category. Order matters: specific first.
function mapBucket(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  if (/hot ?dog|corn dog/.test(t)) return 'food';                 // before "dog" — "hot dog" is food
  if (/rabbits?|bunn(y|ies)|hares?/.test(t)) return 'rabbit';
  if (/hamsters?/.test(t)) return 'hamster';
  if (/pandas?/.test(t)) return 'panda';
  if (/kittens?|kitty|\bcats?\b|feline/.test(t)) return 'cat';
  if (/puppy|puppies|corgis?|shibas?|\bdogs?\b|\bpups?\b/.test(t)) return 'dog';
  if (/teddy|\bbears?\b/.test(t)) return 'bear';
  if (/ducks?|penguins?|parrots?|\bowls?\b|sparrows?|chicks?|\bbirds?\b/.test(t)) return 'bird';
  if (/persons?|humans?|\bm[ae]n\b|wom[ae]n|\bgirls?\b|\bboys?\b|people|lady|ladies|\bguys?\b|geisha/.test(t)) return 'human';
  if (/coffee|sausage|bread|cake|fruit|burger|pizza|noodles?|ramen|drinks?|\bfoods?\b|meal/.test(t)) return 'food';
  return 'other'; // frog, otter, fish, crab, abstract shapes, unknown animals → other
}

// Ground truth for the 7 hard pilots (acceptable mapped buckets). Others = unknown, shown only.
const GT = {
  '33799640': ['cat', 'bear', 'other'], // CHIIKAWA
  '35143333': ['other'],                 // green frog
  '27489190': ['bird', 'food'],          // coffee + bird
  '26357323': ['food'],                  // hot dog
  '34642714': ['rabbit'],                // pink bunny
  '35306649': ['other', 'bear'],         // sea otter
  '35226490': ['other', 'bird', 'food'], // multi-object wreath
};
let hits = 0, scored = 0;

console.log('=== Step 2: classify 12 stickers ===');
console.log('(note "Neurons used" on the dashboard now, if you can find it — else we compute from the run)\n');

let done = 0, failed = 0, totalNeurons = 0, totalInTok = 0, totalOutTok = 0;
const lat = [];
for (const id of IDS) {
  try {
    const imgRes = await fetch(thumbUrl(id));
    if (!imgRes.ok) { console.log(`   skip ${id}: thumb HTTP ${imgRes.status}`); failed++; continue; }
    const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

    const t0 = Date.now();
    const r = await fetch(runUrl, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: `data:image/png;base64,${b64}`,
        task: 'query',
        question: QUESTION,
        reasoning: false,
        stream: false,
        max_tokens: 64,
      }),
    });
    const ms = Date.now() - t0;
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) {
      if (failed === 0) console.log(`   FULL ERROR for ${id} (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
      else console.log(`   fail ${id}: ${JSON.stringify(j.errors ?? j).slice(0, 120)}`);
      failed++;
      continue;
    }
    // Moondream nests the payload as result.result; usage/neurons sit at result.usage.
    const inner = j.result?.result ?? j.result ?? {};
    const usage = j.result?.usage ?? {};
    const answer = String(inner.answer ?? inner.caption ?? inner.description ?? '').trim().replace(/\s+/g, ' ');
    const neurons = Number(usage.neurons ?? 0);
    totalNeurons += neurons;
    totalInTok += Number(usage.prompt_tokens ?? inner.metrics?.input_tokens ?? 0);
    totalOutTok += Number(usage.completion_tokens ?? inner.metrics?.output_tokens ?? 0);
    done++; lat.push(ms);
    const bucket = mapBucket(answer);
    let mark = ' ';
    if (GT[id]) { scored++; const ok = GT[id].includes(bucket); if (ok) hits++; mark = ok ? '✅' : '❌'; }
    console.log(`   ${String(done).padStart(2)}. ${id}  ${mark} [${bucket.padEnd(7)}] "${answer}"   (${neurons.toFixed(1)} n, ${ms} ms)`);
  } catch (e) {
    console.log(`   error ${id}: ${e.message}`); failed++;
  }
}

const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
console.log(`\n=== DONE ===  model: ${MODEL}`);
console.log(`classified OK: ${done}   |   failed: ${failed}   |   avg latency: ${avg} ms`);
if (scored) console.log(`hard-set accuracy (open prompt + local mapping): ${hits}/${scored}`);

if (done) {
  const perImage = totalNeurons / done;
  const perDayFree = Math.floor(10000 / perImage);        // free capacity at 10k neurons/day
  const NEED = 340;                                        // measured daily new-entrants (avg)
  const oneOff = 1500 * perImage;                          // neurons to backfill current top-1500
  const overageUSD = Math.max(0, oneOff - 10000) / 1000 * 0.011; // same-day cost beyond the free 10k
  console.log('\n──── COST (measured from the API, no dashboard needed) ────');
  console.log(`avg tokens/image : ${Math.round(totalInTok / done)} in + ${Math.round(totalOutTok / done)} out`);
  console.log(`neurons/image    : ${perImage.toFixed(2)}`);
  console.log(`FREE capacity    : ${perDayFree} images/day   (free pool = 10,000 neurons/day)`);
  console.log(`daily need       : ~${NEED} new stickers/day`);
  console.log(`verdict          : ${perDayFree >= NEED
    ? `✅ FREE FOREVER for the daily load (${perDayFree - NEED}/day headroom)`
    : `⚠️ NOT enough free headroom (${perDayFree} < ${NEED}) — daily load would hit paid overage`}`);
  console.log(`one-off 1,500    : ${Math.round(oneOff).toLocaleString()} neurons` +
    ` → free if spread over ~${Math.ceil(oneOff / 10000)} days, or ~$${overageUSD.toFixed(2)} (฿${(overageUSD * 36).toFixed(0)}) to run same-day`);
}
