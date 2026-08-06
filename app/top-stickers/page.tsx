import Image from 'next/image';
import { getDb, getGlobalStickerRanking, UNRANKED_RANK, type GlobalStickerRanking } from '@/lib/db';
import { COUNTRY_MAP } from '@/lib/countries';
import BackButton from '@/components/BackButton';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import type { Metadata } from 'next';

const TOP_N = 100;

const DESCRIPTION =
  'One combined LINE sticker ranking across Japan, Thailand and Taiwan — packs ordered by their ' +
  'average chart position in all three markets, updated hourly.';

// Same 30 min as /creators: the underlying scrape is hourly, so anything shorter re-runs the
// aggregation without new data behind it.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Top LINE Stickers — Combined Ranking (Japan, Thailand, Taiwan)',
  description: DESCRIPTION,
  alternates: { canonical: '/top-stickers' },
  openGraph: {
    type: 'website',
    title: 'Top LINE Stickers — Combined Ranking (Japan, Thailand, Taiwan)',
    description: DESCRIPTION,
    url: `${SITE_URL}/top-stickers`,
  },
};

const BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Top Stickers', item: `${SITE_URL}/top-stickers` },
  ],
};

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500 dark:text-yellow-400 font-bold';
  if (rank <= 3) return 'text-orange-400 dark:text-orange-300 font-semibold';
  if (rank <= 10) return 'text-green-600 dark:text-green-400 font-semibold';
  if (rank <= 100) return 'text-gray-600 dark:text-gray-300';
  return 'text-gray-400 dark:text-gray-500';
}

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

export default async function TopStickersPage() {
  let data: GlobalStickerRanking = {
    asOf: null,
    countries: [],
    packs: [],
    totalPacks: 0,
    characterTravel: [],
  };
  try {
    data = await getGlobalStickerRanking(getDb(), TOP_N);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render the shell (HTTP 200), not a 500.
  }

  const CC = data.countries;

  const jsonLd = data.packs.length
    ? [
        BREADCRUMB,
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Top LINE stickers across Japan, Thailand and Taiwan',
          description: DESCRIPTION,
          url: `${SITE_URL}/top-stickers`,
          numberOfItems: data.packs.length,
          itemListElement: data.packs.slice(0, 20).map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: p.name,
            url: `${SITE_URL}/sticker/${p.id}`,
          })),
        },
      ]
    : [BREADCRUMB];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <JsonLd data={jsonLd} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-4">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">🏆 Top LINE Stickers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            One ranking across all three markets. Every other chart on this site answers &ldquo;what is
            big in Japan&rdquo; or &ldquo;what is big in Thailand&rdquo; — this one answers which pack is
            doing best <b className="font-semibold text-gray-600 dark:text-gray-300">everywhere at once</b>.
          </p>
          {data.asOf && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Snapshot {data.asOf} · top {TOP_N} of {data.totalPacks.toLocaleString()} packs charting
              somewhere · refreshes hourly
            </p>
          )}
        </div>

        {/* Lifted from the insights page: it answers the question this leaderboard raises. Once you
            see that the top packs are the ones charting in several markets, the natural next question
            is which KIND of pack manages that. */}
        {data.characterTravel.length > 0 && (
          <section className="rounded-2xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Which characters travel
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How often a character crosses borders. Most packs chart in only one country — this is the
              share of each character&apos;s packs that chart in two or three instead. A high number
              means the idea travels; a low one means it tends to stay a local hit. Characters with
              fewer than 15 packs are left out, because with only a handful a single crossover swings
              the percentage wildly.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {data.characterTravel.map((t) => (
                <span
                  key={t.key}
                  title={`${t.packs} ${t.label.replace(/^\S+\s/, '').toLowerCase()} packs charting, ${Math.round((t.multiPct / 100) * t.packs)} of them in more than one country`}
                  className="text-xs px-2 py-1 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                >
                  {t.label} <b className="text-gray-800 dark:text-gray-100 tabular-nums">{t.multiPct}%</b>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              Hover a chip for how many packs it is based on. Full market breakdown on the{' '}
              <a href="/insights" className="text-green-600 dark:text-green-400 hover:underline">
                insights page
              </a>
              .
            </p>
          </section>
        )}

        <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 w-12">#</th>
                <th className="text-left px-2 py-2.5">Sticker</th>
                {CC.map((cc) => (
                  <th key={cc} className="px-3 py-2.5 text-center whitespace-nowrap">
                    {COUNTRY_MAP[cc]?.flag} {cc.toUpperCase()}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center hidden sm:table-cell" title="How many of the three markets it charts in">
                  In
                </th>
              </tr>
            </thead>
            <tbody>
              {data.packs.length === 0 && (
                <tr>
                  <td colSpan={CC.length + 3} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                    No data yet
                  </td>
                </tr>
              )}
              {data.packs.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-t border-gray-50 dark:border-gray-800 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
                >
                  <td className="px-4 py-3 text-center font-bold text-gray-400 dark:text-gray-500">
                    {medal(i) ?? i + 1}
                  </td>
                  <td className="px-2 py-3">
                    <a href={`/sticker/${p.id}`} className="flex items-center gap-2.5 group">
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                        <Image
                          src={
                            p.image_url ??
                            `https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`
                          }
                          alt={p.name}
                          width={36}
                          height={36}
                          className="object-contain w-full h-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-700 dark:text-gray-200 truncate group-hover:text-green-700 dark:group-hover:text-green-300">
                          {p.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {p.author ?? 'Unknown creator'}
                        </p>
                      </div>
                    </a>
                  </td>
                  {CC.map((cc) => {
                    const r = p.ranks[cc];
                    return (
                      <td key={cc} className="px-3 py-3 text-center">
                        {r == null ? (
                          <span
                            className="text-gray-300 dark:text-gray-600"
                            title={`Not in ${COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}'s top ${UNRANKED_RANK} — counted as ${UNRANKED_RANK} in the average`}
                          >
                            —
                          </span>
                        ) : (
                          <span className={`tabular-nums ${rankClass(r)}`}>#{r}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center hidden sm:table-cell">
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {p.markets}/{CC.length}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Updated hourly from store.line.me · single-market charts on the{' '}
          <a href="/" className="text-green-600 dark:text-green-400 hover:underline">main page</a>
        </p>
      </div>
    </div>
  );
}
