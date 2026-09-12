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

/** Today in Bangkok — the clock the site presents everywhere else. */
export function todayBangkok(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A day that can never change again is safe to cache at the CDN for a week; today's snapshot is
 * still being written to hourly, so it must always reach the database.
 */
export const ARCHIVED_DAY_CACHE_CONTROL = 'public, s-maxage=604800, stale-while-revalidate=86400';

/** True when `date` is a real day strictly before today in Bangkok — i.e. immutable. */
export function isArchivedDay(date: string | null): boolean {
  return date !== null && date < todayBangkok();
}
