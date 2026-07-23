import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb, getCharacterRankings, type CountryCharacterData } from '@/lib/db';
import CharactersClient from './CharactersClient';
import BackButton from '@/components/BackButton';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

// ISR like the other ranking pages — rankings change hourly, so repeated crawls serve from cache
// instead of re-reading ~1,500 rows each time.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'LINE Sticker Character Rankings — Cat, Dog, Rabbit & More',
  description:
    'Live LINE sticker rankings by character type — the top cat, dog, rabbit, bear and human sticker packs charting in Japan, Thailand and Taiwan right now, refreshed hourly.',
  alternates: { canonical: '/characters' },
  openGraph: {
    type: 'website',
    title: 'LINE Sticker Character Rankings — Cat, Dog, Rabbit & More',
    description:
      'The top cat, dog, rabbit and human LINE sticker packs in Japan, Thailand and Taiwan, refreshed hourly.',
    url: `${SITE_URL}/characters`,
  },
};

const CHARACTERS_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'LINE Sticker Character Rankings',
  url: `${SITE_URL}/characters`,
  description:
    'Live LINE sticker rankings split by character type (cat, dog, rabbit, bear, human and more) for Japan, Thailand and Taiwan.',
  isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
};

export default async function CharactersPage() {
  const client = getDb();
  let data: CountryCharacterData[] = [];
  try {
    data = await getCharacterRankings(client, ['jp', 'th', 'tw']);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render the shell empty (HTTP 200), not a 500.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={CHARACTERS_JSONLD} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <Link href="/" className="text-sm text-green-600 hover:underline">Main</Link>
        </div>

        <div className="mt-5 mb-2">
          <h1 className="text-xl font-bold text-gray-800">🐾 LINE Sticker Character Rankings</h1>
          <p className="text-sm text-gray-500 mt-1">
            The top packs of each character type — cat, dog, rabbit, human and more — charting in
            Japan, Thailand and Taiwan right now.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Characters are auto-detected from each pack&apos;s art. Pick one, compare the three markets.
          </p>
        </div>

        <CharactersClient data={data} />
      </div>
    </div>
  );
}
