import { getDb, getProductsByAuthor, getProductsWithRankings } from '@/lib/db';
import CreatorClient from './CreatorClient';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';

// Cached (ISR) for 30 min instead of force-dynamic so repeated crawls of a creator page don't
// re-query the DB each time; rankings only change hourly, so 30 min staleness is invisible.
export const revalidate = 1800;

// Required to put a dynamic-param route on the ISR cache path: with revalidate alone Next still
// renders every request. Returning [] builds nothing up front — each /creator/<name> is generated
// on first hit, then served from cache for `revalidate`, so repeat crawls skip the DB.
export function generateStaticParams() {
  return [];
}

// decodeURIComponent throws URIError on malformed input (e.g. a crawler hitting
// /creator/100%); that must resolve to 404, never a 500.
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'];

interface Props {
  params: Promise<{ name: string }>;
}

// Request-deduped so generateMetadata and the page share one author lookup.
const getAuthorProducts = cache(async (author: string) => {
  const client = getDb();
  return getProductsByAuthor(client, author);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const author = safeDecode(name);
  if (!author) {
    return { title: 'Creator not found', robots: { index: false, follow: false } };
  }
  const canonical = `/creator/${encodeURIComponent(author)}`;
  let products: Awaited<ReturnType<typeof getAuthorProducts>>;
  try {
    products = await getAuthorProducts(author);
  } catch {
    // DB unreadable — basic metadata without noindex so a transient outage doesn't drop the page.
    return { title: `${author} — LINE Sticker Creator`, alternates: { canonical } };
  }

  // A creator with nothing in the DB is a thin/empty page — keep it out of the index.
  if (!products.length) {
    return {
      title: `${author} — LINE Sticker Creator`,
      robots: { index: false, follow: true },
      alternates: { canonical },
    };
  }

  const description = `LINE sticker packs by ${author}, with live rankings and 30-day rank history across Japan, Thailand & Taiwan.`;
  return {
    title: `${author} — LINE Sticker Creator`,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      title: `${author} — LINE Sticker Creator`,
      description,
      url: `${SITE_URL}${canonical}`,
    },
  };
}

export default async function CreatorPage({ params }: Props) {
  const { name } = await params;
  const author = safeDecode(name);
  if (!author) notFound();
  const client = getDb();

  let products: Awaited<ReturnType<typeof getAuthorProducts>> = [];
  let rankings: Awaited<ReturnType<typeof getProductsWithRankings>> = {};
  try {
    products = await getAuthorProducts(author);
    const ids = products.map((p) => p.id);
    rankings = await getProductsWithRankings(client, ids, FEATURED);
  } catch {
    // DB unreadable (e.g. Turso read quota) — render an empty creator page (HTTP 200), not a 500.
  }

  const withRankings = products.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    author: p.author,
    sticker_type: p.sticker_type,
    rankings: rankings[p.id] ?? Object.fromEntries(FEATURED.map((cc) => [cc, null])),
  }));

  const jsonLd = products.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${author} — LINE Stickers`,
        url: `${SITE_URL}/creator/${encodeURIComponent(author)}`,
        about: { '@type': 'Person', name: author },
      }
    : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CreatorClient author={author} products={withRankings} />
    </>
  );
}
