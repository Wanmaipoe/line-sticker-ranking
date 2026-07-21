import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb, getCategoryRankings, type CountryCategoryData } from '@/lib/db';
import CategoriesClient from './CategoriesClient';
import BackButton from '@/components/BackButton';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

// Cached (ISR) for 30 min like the country pages — rankings change hourly, so repeated crawls
// serve from cache instead of re-reading ~1,500 rows each time.
export const revalidate = 1800;

export const metadata: Metadata = {
  // Targets "LINE animated sticker ranking" / "LINE popup sticker ranking" style queries.
  title: 'LINE Sticker Category Rankings — Animated, Pop-up & More',
  description:
    'Live LINE sticker rankings by category — the top animated, pop-up and classic sticker packs charting in Japan, Thailand and Taiwan right now, refreshed hourly.',
  alternates: { canonical: '/categories' },
  openGraph: {
    type: 'website',
    title: 'LINE Sticker Category Rankings — Animated, Pop-up & More',
    description:
      'The top animated, pop-up and classic LINE sticker packs in Japan, Thailand and Taiwan, refreshed hourly.',
    url: `${SITE_URL}/categories`,
  },
};

const CATEGORIES_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'LINE Sticker Category Rankings',
  url: `${SITE_URL}/categories`,
  description:
    'Live LINE sticker rankings split by category (animated, pop-up, classic) for Japan, Thailand and Taiwan.',
  isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
};

export default async function CategoriesPage() {
  const client = getDb();
  let data: CountryCategoryData[] = [];
  try {
    data = await getCategoryRankings(client, ['jp', 'th', 'tw']);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render the shell empty (HTTP 200), not a 500.
  }

  const latestDate = data.find((d) => d.date)?.date ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={CATEGORIES_JSONLD} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <Link href="/" className="text-sm text-green-600 hover:underline">Main</Link>
        </div>

        <div className="mt-5 mb-2">
          <h1 className="text-xl font-bold text-gray-800">🗂️ LINE Sticker Category Rankings</h1>
          <p className="text-sm text-gray-500 mt-1">
            The top packs of each sticker type charting in Japan, Thailand and Taiwan right now.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Pick a category, compare the three markets. Read live from LINE&apos;s top-500 per country.
          </p>
        </div>

        <CategoriesClient data={data} latestDate={latestDate} />
      </div>
    </div>
  );
}
