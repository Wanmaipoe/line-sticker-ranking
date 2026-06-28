import { getDb, getCreatorLeaderboards } from '@/lib/db';
import CreatorsLeaderboard from './CreatorsLeaderboard';
import BackButton from '@/components/BackButton';
import { SITE_URL } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Top LINE Sticker Creators',
  description:
    "Which LINE sticker creators dominate the charts in Japan, Thailand & Taiwan right now — ranked by how many packs sit in the latest top 100.",
  alternates: { canonical: '/creators' },
  openGraph: {
    type: 'website',
    title: 'Top LINE Sticker Creators',
    description: 'Which LINE sticker creators dominate the charts in Japan, Thailand & Taiwan right now.',
    url: `${SITE_URL}/creators`,
  },
};

export default async function CreatorsPage() {
  const client = getDb();
  const boards = await getCreatorLeaderboards(client, 100, 60);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <a href="/" className="text-sm text-green-600 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-2">
          <h1 className="text-xl font-bold text-gray-800">🏅 Top Creators</h1>
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
