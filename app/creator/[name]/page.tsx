import {
  getDb,
  getProductsByAuthor,
  getProductsWithRankings,
  getCreatorRankHistory,
  getPackLifecycles,
  getCreatorLeaderboards,
  TOP_PACKS_PER_COUNTRY,
  type CreatorRankHistoryPoint,
  type PackLifecycles,
} from '@/lib/db';
import { FEATURED_COUNTRIES } from '@/lib/countries';
import { analyzeCreator, type CreatorAnalysis, type CreatorBenchmark } from '@/lib/creator-analysis';
import CreatorClient from './CreatorClient';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
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

const FEATURED = FEATURED_COUNTRIES;

// The "vs top creator" benchmark is IDENTICAL for every creator page, so it lives in the shared
// data cache instead of being refetched per page: measured at ~1.2k rows per fetch, per-page it
// would cost ~40M reads/month at crawl traffic; cached it is ~2k rows once per 30 min (~3M/month).
// The top TWO creators are cached so a page whose creator IS #1 falls through to #2 without
// needing a per-author cache key — the pool stays global.
const getBenchmarkPool = unstable_cache(
  async (): Promise<{ author: string; analysis: CreatorAnalysis }[]> => {
    const client = getDb();
    const boards = await getCreatorLeaderboards(client, 100, 2);
    const entries: { author: string; analysis: CreatorAnalysis }[] = [];
    for (const c of boards.all.slice(0, 2)) {
      const bProducts = await getProductsByAuthor(client, c.author);
      const bIds = bProducts.map((p) => p.id);
      const [bRankings, bLifecycles] = await Promise.all([
        getProductsWithRankings(client, bIds, FEATURED),
        getPackLifecycles(client, bIds, FEATURED),
      ]);
      // Empty history is deliberate: the benchmark never shows a "peak this week", and fetching
      // 7-day history for it would put the page's single biggest cost on the shared path too.
      const analysis = analyzeCreator(bProducts, bRankings, [], bLifecycles, FEATURED);
      if (analysis) entries.push({ author: c.author, analysis });
    }
    return entries;
  },
  ['creator-benchmark-pool'],
  // Matches the page's own ISR window — fresher than the pages consuming it would be wasted reads.
  { revalidate: 1800 }
);

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

  // ── Ranking-history chart data ────────────────────────────────────────────
  // Pick the top packs PER COUNTRY, not one global top-N. A global list is dominated by whichever
  // market the creator is strongest in and starves the others: NishimuraYuji has 13 packs charting
  // in Japan but a global top-8 surfaced only 2 of them. The cap also keeps each chart readable
  // (he has 33 currently-ranked packs across markets) and bounds the read cost on an ISR page
  // that Google crawls across ~500 creators.
  const packsByCountry: Record<string, { id: string; name: string }[]> = {};
  const rankedByCountry: Record<string, number> = {};
  for (const cc of FEATURED) {
    const ranked = withRankings
      .filter((p) => typeof p.rankings[cc] === 'number')
      .sort((a, b) => (a.rankings[cc] as number) - (b.rankings[cc] as number));
    rankedByCountry[cc] = ranked.length;
    packsByCountry[cc] = ranked.slice(0, TOP_PACKS_PER_COUNTRY).map((p) => ({ id: p.id, name: p.name }));
  }

  // One history fetch covers the union, so switching country in the chart costs no extra reads.
  const unionIds = [...new Set(Object.values(packsByCountry).flatMap((ps) => ps.map((p) => p.id)))];

  // Always open on Japan (FEATURED_COUNTRIES[0], the primary market) so the chart is consistent
  // from creator to creator. Previously this opened on whichever market the creator had the most
  // packs in, which meant the same page could greet you with a different country each visit.
  // CreatorRankGraph falls back to the first market that actually has packs when a creator has
  // nothing charting in Japan, so this never renders an empty chart.
  const defaultCountry: string = FEATURED[0];

  let history: CreatorRankHistoryPoint[] = [];
  if (unionIds.length) {
    try {
      history = await getCreatorRankHistory(client, unionIds, 7);
    } catch {
      // Chart is a nice-to-have: on a DB failure the page still renders the table.
    }
  }

  // When each pack entered/left each chart — seek-only (~3 rows per pack per market), powering the
  // "new this month" and "chart veterans" sections. Fetched separately from the analysis call so a
  // failure here degrades to a card without those two sections, not a missing card.
  let lifecycles: PackLifecycles | null = null;
  if (products.length) {
    try {
      lifecycles = await getPackLifecycles(client, products.map((p) => p.id), FEATURED);
    } catch {
      // Lifecycle sections are a nice-to-have.
    }
  }

  // Pure computation over data already in memory — no reads on top of what the page spent above.
  const analysis = analyzeCreator(products, rankings, history, lifecycles, FEATURED);

  // "vs top creator": pulled from the shared 30-min pool (see getBenchmarkPool above), measured
  // with the SAME analyzeCreator pass so the comparison is like-for-like. Wrapped separately:
  // a failure hides the benchmark column, not the whole analysis card.
  let benchmark: CreatorBenchmark | null = null;
  if (analysis) {
    try {
      const pool = await getBenchmarkPool();
      const youAreTop = pool[0]?.author === author;
      const pick = pool.find((e) => e.author !== author);
      if (pick) benchmark = { author: pick.author, youAreTop, analysis: pick.analysis };
    } catch {
      // Benchmark is a nice-to-have.
    }
  }

  const creatorUrl = `${SITE_URL}/creator/${encodeURIComponent(author)}`;
  const jsonLd = products.length
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${author} — LINE Stickers`,
          url: creatorUrl,
          about: { '@type': 'Person', name: author },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: withRankings.length,
            itemListElement: withRankings.map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/sticker/${p.id}`,
              name: p.name,
            })),
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Top Creators', item: `${SITE_URL}/creators` },
            { '@type': 'ListItem', position: 3, name: author, item: creatorUrl },
          ],
        },
      ]
    : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CreatorClient
        author={author}
        products={withRankings}
        graphPacksByCountry={packsByCountry}
        graphHistory={history}
        graphDefaultCountry={defaultCountry}
        rankedByCountry={rankedByCountry}
        analysis={analysis}
        benchmark={benchmark}
      />
    </>
  );
}
