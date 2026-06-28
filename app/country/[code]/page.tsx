import { getDb } from '@/lib/db';
import { COUNTRY_MAP, isFeaturedCountry } from '@/lib/countries';
import CountryClient from './CountryClient';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const cc = code.toLowerCase();
  if (!isFeaturedCountry(cc)) {
    return { title: 'Country not found', robots: { index: false, follow: false } };
  }
  const info = COUNTRY_MAP[cc];
  const name = info?.name ?? cc.toUpperCase();
  const description = `The top 50 LINE stickers in ${name} right now, refreshed hourly with rank changes and 30-day history.`;
  return {
    title: `Top LINE Stickers in ${name}`,
    description,
    alternates: { canonical: `/country/${cc}` },
    openGraph: {
      type: 'website',
      title: `Top LINE Stickers in ${name}`,
      description,
      url: `${SITE_URL}/country/${cc}`,
    },
  };
}

export default async function CountryPage({ params }: Props) {
  const { code } = await params;
  const cc = code.toLowerCase();
  if (!isFeaturedCountry(cc)) notFound();
  const client = getDb();

  const dateRes = await client.execute({
    sql: `SELECT MAX(snapshot_date) AS latest, MAX(snapshot_hour) AS latest_hour FROM rankings WHERE country = ? AND snapshot_date = (SELECT MAX(snapshot_date) FROM rankings WHERE country = ?)`,
    args: [cc, cc],
  });
  const latestDate = dateRes.rows[0]?.latest as string | null;
  const latestHour = dateRes.rows[0]?.latest_hour as number | null;

  let items: { rank: number; id: string; name: string; image_url: string | null; author: string | null; sticker_type: string | null }[] = [];

  if (latestDate) {
    const result = await client.execute({
      sql: `SELECT r.rank, p.id, p.name, p.image_url, p.author, p.sticker_type
            FROM rankings r
            JOIN products p ON p.id = r.product_id
            WHERE r.country = ? AND r.snapshot_date = ? AND r.snapshot_hour = ?
            ORDER BY r.rank ASC
            LIMIT 50`,
      args: [cc, latestDate, latestHour],
    });
    items = result.rows.map((row) => ({
      rank: row.rank as number,
      id: row.id as string,
      name: row.name as string,
      image_url: row.image_url as string | null,
      author: row.author as string | null,
      sticker_type: row.sticker_type as string | null,
    }));
  }

  const info = COUNTRY_MAP[cc];
  const countryName = info?.name ?? cc.toUpperCase();

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Top LINE Stickers in ${countryName}`,
    url: `${SITE_URL}/country/${cc}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.slice(0, 10).map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/sticker/${it.id}`,
        name: it.name,
      })),
    },
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: `Top Stickers in ${countryName}`, item: `${SITE_URL}/country/${cc}` },
    ],
  };

  return (
    <>
      <JsonLd data={[collectionJsonLd, breadcrumbJsonLd]} />
      <CountryClient
        code={cc}
        name={countryName}
        flag={info?.flag ?? '🌏'}
        date={latestDate}
        items={items}
      />
    </>
  );
}
