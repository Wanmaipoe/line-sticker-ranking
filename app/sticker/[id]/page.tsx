import { getDb, getLatestRankingsForProduct, getRankingHistoryAll } from '@/lib/db';
import StickerDetailClient from './StickerDetailClient';
import JsonLd from '@/components/JsonLd';
import DataUnavailable from '@/components/DataUnavailable';
import { SITE_URL, SITE_NAME, stickerImage } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';

// Cached (ISR) for 30 min instead of force-dynamic so repeated crawls of a sticker page don't
// re-query the DB each time; rank/history only change hourly, so 30 min staleness is invisible.
export const revalidate = 1800;

// Required to put a dynamic-param route on the ISR cache path: with revalidate alone Next still
// renders every request (no caching). Returning [] builds nothing up front — each /sticker/<id>
// is generated on first hit, then served from cache for `revalidate`, so repeat crawls skip the DB.
export function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ id: string }>;
}

// Request-deduped product fetch so generateMetadata and the page share one DB round-trip.
const getProduct = cache(async (id: string) => {
  const client = getDb();
  const result = await client.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [id] });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    image_url: row.image_url as string | null,
    author: row.author as string | null,
    price: row.price as number | null,
    price_currency: row.price_currency as string | null,
    description: row.description as string | null,
    sticker_type: row.sticker_type as string | null,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  let product: Awaited<ReturnType<typeof getProduct>> = null;
  try {
    product = await getProduct(id);
  } catch {
    // DB unreadable — generic title, not noindex, so a transient outage doesn't drop the page.
    // Self-canonical is required here: without page-level `alternates` this branch would
    // inherit the root layout's canonical="/" + hreflang cluster, telling Google every
    // sticker page is a duplicate of the homepage during an outage.
    return { title: 'LINE Sticker Ranking & Price', alternates: { canonical: `/sticker/${id}` } };
  }
  if (!product) {
    return {
      title: 'Sticker not found',
      robots: { index: false, follow: false },
      alternates: { canonical: `/sticker/${id}` },
    };
  }

  const img = product.image_url ?? stickerImage(id);
  const by = product.author ? ` by ${product.author}` : '';
  const description =
    product.description?.trim() ||
    `Live LINE sticker ranking, price, and 30-day rank history for "${product.name}"${by} across Japan, Thailand & Taiwan.`;

  return {
    title: `${product.name} — LINE Sticker Ranking & Price`,
    description,
    alternates: { canonical: `/sticker/${id}` },
    openGraph: {
      type: 'website',
      title: `${product.name} — LINE Sticker Ranking`,
      description,
      url: `${SITE_URL}/sticker/${id}`,
      images: [{ url: img, alt: product.name }],
    },
    twitter: { card: 'summary_large_image', title: product.name, description, images: [img] },
  };
}

export default async function StickerPage({ params }: Props) {
  const { id } = await params;
  let product: Awaited<ReturnType<typeof getProduct>> = null;
  try {
    product = await getProduct(id);
  } catch {
    // DB unreadable (e.g. Turso read quota) — show a friendly 200 fallback, not a 500 to crawlers.
    return <DataUnavailable />;
  }
  if (!product) notFound();

  const client = getDb();
  let rankings: Awaited<ReturnType<typeof getLatestRankingsForProduct>> = [];
  try {
    rankings = await getLatestRankingsForProduct(client, id);
  } catch {
    rankings = [];
  }
  // All-country 30-day history in one PK-indexed read, fetched server-side so the client chart
  // (all-country + per-country views) needs zero further DB reads. Cached with the page (ISR).
  let history: Awaited<ReturnType<typeof getRankingHistoryAll>> = [];
  try {
    history = await getRankingHistoryAll(client, id, 30);
  } catch {
    history = [];
  }
  const img = product.image_url ?? stickerImage(id);

  const productJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: img,
    url: `${SITE_URL}/sticker/${id}`,
    ...(product.description ? { description: product.description } : {}),
    ...(product.author ? { brand: { '@type': 'Brand', name: product.author } } : {}),
    ...(product.price != null && product.price_currency === 'USD'
      ? {
          offers: {
            '@type': 'Offer',
            price: (product.price / 100).toFixed(2),
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            url: `https://store.line.me/stickershop/product/${id}/en`,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: product.name, item: `${SITE_URL}/sticker/${id}` },
    ],
  };

  return (
    <>
      <JsonLd data={[productJsonLd, breadcrumbJsonLd]} />
      <StickerDetailClient
        id={id}
        name={product.name}
        imageUrl={img}
        author={product.author}
        price={product.price}
        priceCurrency={product.price_currency}
        description={product.description}
        stickerType={product.sticker_type}
        initialRankings={rankings}
        initialHistory={history}
      />
    </>
  );
}
