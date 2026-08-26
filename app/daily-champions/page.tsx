import { getDb } from '@/lib/db';
import { getDailyChampions, DAILY_CHAMPION_DAYS, type CountryChampions } from '@/lib/champions';
import DailyChampionsClient from './DailyChampionsClient';
import BackButton from '@/components/BackButton';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import type { Metadata } from 'next';

// Imported, never re-declared: /api/daily-champions (the Refresh button) must return exactly the
// window the page was rendered with, or a refresh would silently change how many days are listed.
const DAYS = DAILY_CHAMPION_DAYS;

const DESCRIPTION =
  'The #1 LINE sticker for every day in Japan, Thailand and Taiwan. The chart is read hourly, so ' +
  'each day is awarded to the pack that held first place the longest — with the packs it beat.';

// Matches /top-stickers and /creators. The underlying scrape is hourly and only the newest row can
// change, so a shorter window would re-run the aggregation with nothing new behind it.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Daily #1 LINE Stickers — Japan, Thailand & Taiwan Day-by-Day Winners',
  description: DESCRIPTION,
  alternates: { canonical: '/daily-champions' },
  openGraph: {
    type: 'website',
    title: 'Daily #1 LINE Stickers — Day-by-Day Winners',
    description: DESCRIPTION,
    url: `${SITE_URL}/daily-champions`,
  },
};

const BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Daily #1', item: `${SITE_URL}/daily-champions` },
  ],
};

export default async function DailyChampionsPage() {
  let data: CountryChampions[] = [];
  try {
    data = await getDailyChampions(getDb(), undefined, DAYS);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render the shell (HTTP 200), not a 500, exactly as
    // /top-stickers does.
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <JsonLd data={[BREADCRUMB]} />
      {/* Wider than the other feature pages: each day card spends 96px on a date gutter, then
          splits the rest into three market columns from lg up. At 6xl that is ~350px per market. */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">Main</a>
        </div>

        {/* The title lives inside the client component so the Refresh button can sit on the same
            row at top right and still share its state. It server-renders either way. */}
        <DailyChampionsClient initial={data} />

        {/* The only place the empty cells are explained: each market's day runs on its own clock,
            so the newest and oldest rows legitimately do not cover all three. */}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Last {DAYS} days per market · each market&apos;s day runs on its own clock (Japan UTC+9,
          Thailand UTC+7, Taiwan UTC+8), so the newest and oldest rows may not cover all three ·
          updated hourly from store.line.me
        </p>
      </div>
    </div>
  );
}
