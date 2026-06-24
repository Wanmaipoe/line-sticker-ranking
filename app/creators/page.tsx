import Image from 'next/image';
import { getDb, getCreatorLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Top Creators — LineStickerRanking',
  description: "Which LINE sticker creators dominate the charts across LINE's biggest markets right now.",
};

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

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
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 w-12">#</th>
                <th className="text-left px-2 py-2.5">Creator</th>
                <th className="text-center px-3 py-2.5" title="Total sticker × country slots held in the top 100">
                  Chart slots
                </th>
                <th className="text-center px-3 py-2.5 hidden sm:table-cell" title="Distinct sticker packs charting">
                  Packs
                </th>
                <th className="text-center px-3 py-2.5 hidden sm:table-cell" title="Number of countries they chart in">
                  Countries
                </th>
                <th className="text-center px-3 py-2.5" title="Best (lowest) rank reached by any of their packs">
                  Best
                </th>
              </tr>
            </thead>
            <tbody>
              {creators.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                    No data yet
                  </td>
                </tr>
              )}
              {creators.map((c, i) => (
                <tr
                  key={c.author}
                  className="border-t border-gray-50 hover:bg-green-50 transition-colors"
                >
                  <td className="px-4 py-3 text-center font-bold text-gray-400">
                    {medal(i) ?? i + 1}
                  </td>
                  <td className="px-2 py-3">
                    <a
                      href={`/creator/${encodeURIComponent(c.author)}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                        <Image
                          src={
                            c.sample_image ??
                            `https://stickershop.line-scdn.net/stickershop/v1/product/${c.sample_id}/LINEStorePC/main.png`
                          }
                          alt={c.author}
                          width={36}
                          height={36}
                          className="object-contain w-full h-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-700 truncate group-hover:text-green-700">{c.author}</p>
                        <p className="text-xs text-gray-400 truncate">{c.sample_name}</p>
                      </div>
                    </a>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-green-600">{c.chart_entries}</td>
                  <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{c.distinct_stickers}</td>
                  <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{c.countries}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={c.best_rank === 1 ? 'text-yellow-500 font-bold' : c.best_rank <= 3 ? 'text-orange-400 font-semibold' : c.best_rank <= 10 ? 'text-green-600' : 'text-gray-500'}>
                      #{c.best_rank}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Updated hourly from store.line.me · {creators.length} creators shown
        </p>
      </div>
    </div>
  );
}
