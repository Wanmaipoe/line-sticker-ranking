/**
 * Feature switches. Plain constants, no env var: flipping one is a code change that goes through a
 * deploy, which is what you want for something that sends email to real addresses.
 */

/**
 * Rank alerts: the "🔔 Get rank alerts" box on /sticker/[id], the daily digest cron, and the
 * follow endpoint behind them. Switched OFF 2026-10 — one verified subscriber in five months, so
 * the feature was costing a daily cron and an email path nobody read.
 *
 * Off means: the signup box does not render, POST /api/follow answers 410, and the digest cron
 * returns without touching the database or sending anything. Deliberately still live: the verify
 * and unsubscribe links, so any address already on the list can still confirm or leave — and the
 * subscribers/follows tables, which keep their rows.
 *
 * Turning it back on is this one flag. Nothing else was deleted.
 */
export const RANK_ALERTS_ENABLED = false;
