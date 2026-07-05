import { getDb, getCreatorLeaderboards } from '@/lib/db';
import CreatorsLeaderboard from './CreatorsLeaderboard';
import BackButton from '@/components/BackButton';
import { SITE_URL } from '@/lib/seo';
import type { Metadata } from 'next';

// Cached (ISR) for 30 min instead of force-dynamic so repeated crawls don't re-run the heavy
// leaderboard aggregation query each time; the underlying data only changes hourly.
export const revalidate = 1800;

export const metadata: Metadata = {
  // SEO: this page targets the "LINE creator ranking" / "creator ranking" queries.
  title: 'LINE Creator Ranking — Top Sticker Creators',
  description:
    'Live LINE creator ranking — which sticker creators dominate the top 100 charts in Japan, Thailand & Taiwan, updated hourly.',
  alternates: { canonical: '/creators' },
  openGraph: {
    type: 'website',
    title: 'LINE Creator Ranking — Top Sticker Creators',
    description: 'Live LINE creator ranking — which sticker creators dominate the top 100 charts in Japan, Thailand & Taiwan, updated hourly.',
    url: `${SITE_URL}/creators`,
  },
};

export default async function CreatorsPage() {
  const client = getDb();
  let boards: Awaited<ReturnType<typeof getCreatorLeaderboards>> = { all: [], jp: [], th: [], tw: [] };
  try {
    boards = await getCreatorLeaderboards(client, 100, 60);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render empty leaderboards (HTTP 200), not a 500.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <a href="/" className="text-sm text-green-600 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-2">
          <h1 className="text-xl font-bold text-gray-800">🏅 LINE Creator Ranking</h1>
          <p className="text-sm text-gray-500 mt-1">
            Which creators dominate the charts in Japan, Thailand &amp; Taiwan (latest top 100).
          </p>
          <p className="text-xs text-gray-400 mt-1">Switch market with the buttons, or hover a number for the breakdown.</p>
        </div>

        <CreatorsLeaderboard boards={boards} />

        <p className="text-xs text-gray-400 mt-3">Updated hourly from store.line.me</p>
      </div>
    </div>
  );
}
