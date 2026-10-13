/**
 * Daily: boils the whole history down to 42 rows in day_patterns, the numbers behind the
 * "which day of the week" block on /insights: when new packs reach a top 500, and when packs set
 * their best-ever rank. (A third metric, how often a market's #1 changed hands, was computed here
 * until 2026-10 and dropped — it measured churn at the very top and said little anyone could act on.)
 *
 * WHY PRECOMPUTE: each metric is a GROUP BY over the 21k rows of pack_best. Running them on the
 * /insights render would cost ~42k reads an hour, ~1M a day. Once a day costs 42k, and the page
 * then reads 42 rows. These are slow-moving ratios; a day of staleness is invisible.
 *
 * THE WINDOW starts the day AFTER tracking began. Every pack already charting on the first tracked
 * day carries that date as its first_date (1,493 of them) and many set their recorded "peak" then
 * too, purely because that is when we started looking — counting those would pile a fake spike
 * onto whichever weekday the site launched on. It ends at the last COMPLETE day (yesterday, UTC),
 * so today's partial day cannot drag a weekday down.
 *
 * EVERY COUNT IS PAIRED WITH ITS DAY COUNT. A window rarely holds the same number of Mondays as
 * Sundays, so raw totals are not comparable: the page divides events by days. (The first pass at
 * this read "day 1-12 of the month beat day 13-23 by 50%", which was only the window holding five
 * of the former and four of the latter.)
 *
 * Run daily from .github/workflows/day-patterns.yml, or by hand:
 *   node --env-file=.env.local scripts/compute-day-patterns.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      if (k && !k.startsWith('#') && !process.env[k]) process.env[k] = line.slice(i + 1).trim();
    }
  }
} catch {
  /* not local — CI already has the env */
}

if (!process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const FEATURED = ['jp', 'th', 'tw'];
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

await client.execute(`CREATE TABLE IF NOT EXISTS day_patterns (
  metric TEXT NOT NULL,          -- 'peak' | 'debut'
  country TEXT NOT NULL,
  weekday INTEGER NOT NULL,      -- 0 = Sunday, matching SQLite's strftime('%w')
  events INTEGER NOT NULL,
  days INTEGER NOT NULL,         -- how many of that weekday the window holds, for the average
  window_from TEXT NOT NULL,
  window_to TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (metric, country, weekday)
)`);

const firstTracked = (await client.execute('SELECT MIN(first_date) AS d FROM pack_best')).rows[0].d;
if (!firstTracked) {
  console.error('ERROR: pack_best has no first_date — run scripts/add-pack-debut.mjs first');
  process.exit(1);
}
const from = iso(Date.parse(firstTracked + 'T00:00:00Z') + DAY); // skip the start-of-tracking pile-up
const to = iso(Date.now() - DAY); // last complete day
if (from > to) {
  console.error(`ERROR: empty window (${from} .. ${to})`);
  process.exit(1);
}
console.log(`window ${from} .. ${to}`);

// How many Mondays, Tuesdays … the window holds.
const daysPerWeekday = Array(7).fill(0);
for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += DAY) {
  daysPerWeekday[new Date(t).getUTCDay()]++;
}

/** metric -> country -> weekday -> count */
const tally = { peak: {}, debut: {} };
const bump = (metric, country, weekday, n = 1) => {
  const byCountry = (tally[metric][country] ??= Array(7).fill(0));
  byCountry[weekday] += n;
};

// 1 + 2: peaks and debuts, straight out of pack_best.
for (const [metric, column] of [['peak', 'best_date'], ['debut', 'first_date']]) {
  const r = await client.execute({
    sql: `SELECT country, CAST(strftime('%w', ${column}) AS INTEGER) AS w, COUNT(*) AS n
          FROM pack_best WHERE ${column} BETWEEN ? AND ? GROUP BY country, w`,
    args: [from, to],
  });
  for (const row of r.rows) bump(metric, String(row.country), Number(row.w), Number(row.n));
  console.log(`${metric}: ${r.rows.reduce((a, x) => a + Number(x.n), 0)} events`);
}

const now = new Date().toISOString();
const writes = [];
for (const metric of ['peak', 'debut']) {
  for (const country of FEATURED) {
    for (let w = 0; w < 7; w++) {
      writes.push({
        sql: `INSERT INTO day_patterns (metric, country, weekday, events, days, window_from, window_to, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(metric, country, weekday) DO UPDATE SET
                events = excluded.events, days = excluded.days,
                window_from = excluded.window_from, window_to = excluded.window_to,
                updated_at = excluded.updated_at`,
        args: [metric, country, w, tally[metric][country]?.[w] ?? 0, daysPerWeekday[w], from, to, now],
      });
    }
  }
}
await client.batch(writes, 'write');
console.log(`day_patterns: ${writes.length} rows written`);
process.exit(0);
