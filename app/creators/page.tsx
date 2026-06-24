import { getDb, getCreatorLeaderboard } from '@/lib/db';
import CreatorsLeaderboard from './CreatorsLeaderboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Top Creators — LineStickerRanking',
  description: "Which LINE sticker creators dominate the charts across LINE's biggest markets right now.",
};

export default async function CreatorsPage() {
  const client = getDb();
  const creators = await getCreatorLeaderboard(client, 100, 60);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <a href="/" className="text-sm text-green-600 hover:underline">← LineStickerRanking</a>

        <div className="mt-5 mb-2">
          <h1 className="text-xl font-bold text-gray-800">🏅 Top Creators</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranked by how many chart slots each creator holds across Japan, Thailand, Taiwan, Indonesia &amp; the US (latest top 100).
          </p>
          <p className="text-xs text-gray-400 mt-1">Hover a column header for what it means, or a Chart-slots number for the per-country breakdown.</p>
        </div>

        <CreatorsLeaderboard creators={creators} />

        <p className="text-xs text-gray-400 mt-3">
          Updated hourly from store.line.me · {creators.length} creators shown
        </p>
      </div>
    </div>
  );
}
