/**
 * Rank a pack is treated as holding in a market where it is NOT charting.
 *
 * The chart is 500 deep, so "off the chart" means "501st or worse" — we cannot know which. Scoring
 * a missing market as 500 is the most generous reading of the unknown, and it has to be SOME
 * number: skipping it and averaging only the markets a pack does chart in would rank a pack that
 * is #1 in Thailand and absent everywhere else above one that is #3 in all three, which is the
 * opposite of what a cross-market ranking should say.
 *
 * Lives here rather than in lib/db.ts because the /top-stickers table is a client component, and
 * importing it from lib/db would drag @libsql/client into the browser bundle.
 */
export const UNRANKED_RANK = 500;
