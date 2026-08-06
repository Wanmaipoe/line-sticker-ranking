import { getDb, getGlobalStickerRanking, type GlobalStickerRanking } from '@/lib/db';
import TopStickersClient from './TopStickersClient';
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

        <div className="mt-5">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">🏆 Top LINE Stickers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            One ranking across all three markets. Every other chart on this site answers &ldquo;what is
            big in Japan&rdquo; or &ldquo;what is big in Thailand&rdquo; — this one answers which pack is
            doing best <b className="font-semibold text-gray-600 dark:text-gray-300">everywhere at once</b>.
          </p>
        </div>

        <TopStickersClient initial={data} topN={TOP_N} />

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Updated hourly from store.line.me · single-market charts on the{' '}
          <a href="/" className="text-green-600 dark:text-green-400 hover:underline">main page</a>
        </p>
      </div>
    </div>
  );
}
