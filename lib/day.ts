/**
 * Calendar-day helpers shared by the ranking API routes that accept `?date=`.
 *
 * A snapshot_date is a bare day, never an instant, so everything here is string/UTC arithmetic —
 * see the matching note in components/DateNav.tsx for why local-time getters are a bug here.
 */

/** Strict YYYY-MM-DD that is also a real calendar day (rejects 2026-02-30, 2026-13-01, …). */
export function validDate(v: string | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
}

/**
 * A day that can never change again is safe to cache at the CDN for a week; today's snapshot is
 * still being written to hourly, so it must always reach the database.
 */
export const ARCHIVED_DAY_CACHE_CONTROL = 'public, s-maxage=604800, stale-while-revalidate=86400';

// How long after UTC midnight the previous day can still receive rows. The scraper stamps a whole
// run with the UTC date it STARTED on, so a run that starts at 23:5x keeps writing that day for a
// few minutes past midnight. Two hours is far longer than any run; the only cost is that yesterday
// goes uncached until 02:00 UTC.
const LAST_WRITE_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * True when `date` can no longer change, so its ranking is safe to cache for a week.
 *
 * snapshot_date is a UTC day (scripts/scrape-line-official.mjs stamps rows with
 * `now.toISOString().slice(0, 10)`), so "finished" must be judged in UTC. This used to compare
 * against today in Bangkok, which is a day ahead from 17:00 UTC: the day still being scraped counted
 * as archived, and whoever picked it before 00:00 UTC froze its partial ranking in the CDN for a week.
 */
export function isArchivedDay(date: string | null): boolean {
  return date !== null && date < new Date(Date.now() - LAST_WRITE_GRACE_MS).toISOString().slice(0, 10);
}
