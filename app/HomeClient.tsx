'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import Sparkline from '@/components/Sparkline';
import Footer from '@/components/Footer';
import AdPopup from '@/components/AdPopup';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

type SearchMode = 'sticker' | 'creator';

// Homepage shows only the three core markets. ID/US are still scraped hourly and keep their
// own /country pages + rows on sticker detail pages — this is a display filter, not a data cut,
// so restoring them here is a one-line change.
const HOME_COUNTRIES = ['jp', 'th', 'tw'];

// A "🔥 Hot" mover is a big jump. The Movers board now spans the whole day (not one hour), so
// jumps are larger — a day-scale threshold keeps the badge meaningful instead of tagging everything.
const HOT_JUMP = 100;

// Country options in the "Explore rankings" picker modal. Each links to that country's full
// Top 50 page (/country/[code]).
const HOME_COUNTRY_CHIPS = [
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'th', name: 'Thailand', flag: '🇹🇭' },
  { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
];

interface Product {
  id: string;
  name: string;
  image_url: string | null;
}

interface CreatorResult {
  author: string;
  count: number;
}

interface Top5Item {
  rank: number;
  id: string;
  name: string;
  image_url: string;
  delta: number | null; // places moved up since the previous snapshot (negative = fell); null = no prior data
  isNew: boolean; // new to the chart this snapshot
  spark: number[]; // daily rank history (oldest→newest) for the inline sparkline
}

interface TrendItem {
  id: string;
  name: string;
  image_url: string;
  current_rank: number;
  old_rank: number;
  improvement: number;
}

interface CountryBlock {
  code: string;
  name: string;
  flag: string;
  top5: Top5Item[];
}

interface TrendingBlock {
  code: string;
  name: string;
  flag: string;
  trending: TrendItem[];
  from: number | null;
  to: number | null;
}

interface DashboardData {
  date: string | null;
  updatedAt: string | null;
  countries: CountryBlock[];
}

interface TrendingData {
  countries: TrendingBlock[];
}

function toThaiTime(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toThaiHM(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Relative "updated N ago" for the LIVE pill — the freshness IS the product, so it reads better
// as "23 min ago" than an absolute timestamp. Computed at render (data is fetched once per load).
function toRelative(isoString: string | null): string {
  if (!isoString) return '';
  const mins = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

const STICKER_CDN = (id: string) =>
  `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`;

// Rank badge. The podium (1/2/3) renders as a real gold/silver/bronze medal — a ribbon + a
// metallic medallion disc with the number — so the top three pop (Von Restorff); 4/5 stay a plain
// muted number. Colors follow the classic medal palette (gold red+blue ribbon, silver purple,
// bronze blue).
const MEDAL_COLORS: Record<number, { disc: string; ring: string; num: string; rL: string; rR: string }> = {
  1: { disc: '#f5c518', ring: '#dca600', num: '#6b4e00', rL: '#ef4444', rR: '#3b82f6' },
  2: { disc: '#cdd2d8', ring: '#a7adb5', num: '#475569', rL: '#8b5cf6', rR: '#8b5cf6' },
  3: { disc: '#cd7f32', ring: '#a4641f', num: '#ffffff', rL: '#3b82f6', rR: '#3b82f6' },
};
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const c = MEDAL_COLORS[rank];
    return (
      <span className="flex-shrink-0 w-6 flex justify-center" title={`Rank ${rank}`}>
        <svg width="22" height="27" viewBox="0 0 24 30" role="img" aria-label={`Rank ${rank}`}>
          <polygon points="10,13 12.5,13 7,2 4,2" fill={c.rL} />
          <polygon points="11.5,13 14,13 20,2 17,2" fill={c.rR} />
          <circle cx="12" cy="20" r="8" fill={c.disc} stroke={c.ring} strokeWidth="1.5" />
          <circle cx="12" cy="20" r="5.3" fill="none" stroke={c.ring} strokeWidth="0.75" opacity="0.5" />
          <text x="12" y="20.5" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="700" fill={c.num}>
            {rank}
          </text>
        </svg>
      </span>
    );
  }
  return <span className="flex-shrink-0 w-6 text-center text-sm font-bold text-gray-300 tabular-nums">{rank}</span>;
}

// Rank-movement chip: ▲green up / ▼red down / NEW / – flat. The single most scannable signal on
// a ranking board, so it's shown on every row (data comes from the previous hourly snapshot).
function DeltaChip({ delta, isNew }: { delta: number | null; isNew: boolean }) {
  if (isNew) {
    return (
      <span className="flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-600">
        <span aria-hidden>NEW</span>
        <span className="sr-only">new entry</span>
      </span>
    );
  }
  if (delta == null) return <span className="flex-shrink-0 w-8" aria-hidden />;
  if (delta > 0) {
    return (
      <span className="flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-600 tabular-nums">
        <span aria-hidden>▲{delta}</span>
        <span className="sr-only">up {delta} places</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-500 tabular-nums">
        <span aria-hidden>▼{Math.abs(delta)}</span>
        <span className="sr-only">down {Math.abs(delta)} places</span>
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 text-[11px] text-gray-300 px-1.5">
      <span aria-hidden>–</span>
      <span className="sr-only">no change</span>
    </span>
  );
}

// Sticker artwork thumbnail. Larger than before (default 48px) — the art IS the product, so it
// has to be recognizable at a glance. Same LINE CDN image, so bigger costs zero extra fetch.
function Thumb({ id, name, image_url, size = 48 }: { id: string; name: string; image_url: string | null; size?: number }) {
  return (
    <div className="rounded-lg overflow-hidden bg-gray-50 flex-shrink-0" style={{ width: size, height: size }}>
      <Image
        src={image_url ?? STICKER_CDN(id)}
        alt={name}
        width={size}
        height={size}
        className="object-contain w-full h-full"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
    </div>
  );
}

interface HomeClientProps {
  initialDashboard: DashboardData | null;
  initialTrending: TrendingData | null;
}

export default function HomeClient({ initialDashboard, initialTrending }: HomeClientProps) {
  const router = useRouter();
  const { favorites, isFavorite, toggle } = useFavorites();

  // "Explore rankings" opens a small modal to pick a country → its full Top 50 page.
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  useEffect(() => {
    if (!showCountryPicker) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowCountryPicker(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCountryPicker]);

  // Search
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('sticker');
  const [results, setResults] = useState<Product[]>([]);
  const [creatorResults, setCreatorResults] = useState<CreatorResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Dashboard / trending — seeded from the server render (so the ranking data is already in the
  // initial HTML). Client-fetch ONLY as a fallback when the server couldn't provide it, so a normal
  // page load adds no redundant read.
  const [dashboard, setDashboard] = useState<DashboardData | null>(initialDashboard);
  const [trending, setTrending] = useState<TrendingData | null>(initialTrending);
  const [loadingDash, setLoadingDash] = useState(!initialDashboard);
  const [loadingTrend, setLoadingTrend] = useState(!initialTrending);

  useEffect(() => {
    if (!initialDashboard) {
      fetch('/api/dashboard')
        .then((r) => r.json())
        .then(setDashboard)
        .catch(() => setDashboard({ date: null, updatedAt: null, countries: [] }))
        .finally(() => setLoadingDash(false));
    }
    if (!initialTrending) {
      fetch('/api/trending')
        .then((r) => r.json())
        .then(setTrending)
        .catch(() => setTrending(null))
        .finally(() => setLoadingTrend(false));
    }
  }, [initialDashboard, initialTrending]);

  // Relative "updated N ago" for the LIVE pill is computed client-side only: it depends on the
  // current time, so rendering it during SSR would hydration-mismatch. SSR shows "Live rankings";
  // the client upgrades it to "Live · updated 12 min ago".
  const [relUpdated, setRelUpdated] = useState('');
  useEffect(() => {
    // Intentional client-only computation: toRelative() reads the current time, so it must NOT run
    // during SSR (would hydration-mismatch). Setting state once per updatedAt change is the
    // canonical "render this only after hydration" pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dashboard?.updatedAt) setRelUpdated(toRelative(dashboard.updatedAt));
  }, [dashboard?.updatedAt]);

  const doSearch = useCallback(async (q: string, mode: SearchMode) => {
    if (q.length < 2) {
      setResults([]);
      setCreatorResults([]);
      return;
    }
    setSearching(true);
    try {
      if (mode === 'sticker') {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setCreatorResults([]);
      } else {
        const res = await fetch(`/api/creator?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setCreatorResults(data.results ?? []);
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  const search = useMemo(() => debounce(doSearch, 350), [doSearch]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    search(e.target.value, searchMode);
  }

  function handleModeChange(mode: SearchMode) {
    setSearchMode(mode);
    setResults([]);
    setCreatorResults([]);
    if (query.length >= 2) search(query, mode);
  }

  const showDropdown = query.length >= 2;

  // Board-state number for the hero, derived entirely from the already-fetched /api/trending
  // payload (zero extra DB reads): how many stickers jumped HOT_JUMP+ places today across JP/TH/TW.
  const hotMoversCount =
    trending?.countries
      .filter((c) => HOME_COUNTRIES.includes(c.code))
      .reduce((n, c) => n + c.trending.filter((t) => t.improvement >= HOT_JUMP).length, 0) ?? 0;

  // ----- Server-rendered answer content + structured data (AI/GEO SEO) -----
  // All derived from `dashboard`, which is seeded from the server render, so this whole block is in
  // the initial HTML for AI crawlers (which don't run JS). Zero extra DB reads.
  const homeCountries = dashboard?.countries.filter((c) => HOME_COUNTRIES.includes(c.code)) ?? [];
  const asOf = dashboard?.date ?? null;
  const updatedAbs = dashboard?.updatedAt ? `${toThaiTime(dashboard.updatedAt)} (BKK)` : null;
  const top1 = (code: string) => homeCountries.find((c) => c.code === code)?.top5[0]?.name ?? null;
  const jp1 = top1('jp');
  const th1 = top1('th');
  const tw1 = top1('tw');
  const topAnswer =
    jp1 || th1 || tw1
      ? `As of ${asOf ?? 'today'}, the #1 LINE sticker is ${jp1 ?? 'n/a'} in Japan, ${th1 ?? 'n/a'} in Thailand, and ${tw1 ?? 'n/a'} in Taiwan. Rankings cover the top 500 stickers per country and refresh every hour from LINE Store.`
      : 'Top LINE sticker rankings for Japan, Thailand and Taiwan, refreshed every hour from LINE Store with 30-day rank history.';

  const faqs = [
    { q: 'What are the top LINE stickers right now?', a: topAnswer },
    {
      q: 'How often are the LINE sticker rankings updated?',
      a: 'Every hour. We get the rankings directly from LINE Store’s official charts, and every sticker keeps a 30-day rank history so you can see how it moved.',
    },
    {
      q: 'Which countries does LineStickerRanking cover?',
      a: 'Japan, Thailand and Taiwan — the full top 500 stickers in each country, with the biggest hourly movers and a live creator leaderboard.',
    },
    {
      q: 'Where does the ranking data come from?',
      a: 'Directly from LINE Store’s public creator-sticker charts (store.line.me), captured once an hour per country. LineStickerRanking is an independent tracker and is not affiliated with LINE.',
    },
  ];

  const homeJsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'LINE Sticker Rankings (Japan, Thailand, Taiwan)',
      description:
        'Hourly top-500 LINE sticker popularity rankings for Japan, Thailand and Taiwan, with 30-day rank history and creator leaderboards, sourced from LINE Store.',
      url: SITE_URL,
      creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      isBasedOn: 'https://store.line.me/',
      variableMeasured: 'LINE sticker rank',
      spatialCoverage: ['Japan', 'Thailand', 'Taiwan'],
      temporalCoverage: '2026/..',
      ...(asOf ? { dateModified: asOf } : {}),
      license: `${SITE_URL}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    ...homeCountries.map((c) => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Top LINE stickers in ${c.name}${asOf ? ` (${asOf})` : ''}`,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: c.top5.length,
      itemListElement: c.top5.map((it) => ({
        '@type': 'ListItem',
        position: it.rank,
        url: `${SITE_URL}/sticker/${it.id}`,
        name: it.name,
      })),
    })),
  ];

  // Entry point to the team's revenue-split tool, sitting with the other nav pills. Shown to
  // everyone on purpose — it leads to a password prompt, not to any data — and the padlock sets
  // the expectation before the click.
  //
  // Deliberately a plain <a>, NOT <Link>: this must be a full document load. Microsoft Clarity
  // (session replay) boots from the root layout and keeps recording across client-side
  // navigation, so a <Link> would carry a live Clarity tag onto /revenue and upload the payout
  // figures rendered there. A real navigation guarantees /revenue starts from a document where
  // ClarityAnalytics opted out. Do not "optimise" this back to <Link>.
  const revenueLink = (
    <a
      href="/revenue"
      title="Revenue distribution (team only)"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100/70 text-gray-400 border border-dashed border-gray-300 hover:bg-gray-100 hover:text-gray-600 transition-colors"
    >
      {/* 🔒 is a colour-emoji glyph, so `color` can't touch it and opacity alone just fades the
          gold. grayscale(1) strips the saturation outright, leaving it achromatic to match the
          muted text. */}
      <span className="grayscale opacity-80" aria-hidden>🔒</span> Revenue
    </a>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Image src="/mascot.png" alt="LineStickerRanking logo" width={36} height={36} className="object-contain rounded" />
              <span className="font-bold text-gray-800 text-lg">LineStickerRanking</span>
            </div>
            {dashboard?.updatedAt && (
              <span className="text-xs text-gray-400 sm:hidden">
                {toThaiTime(dashboard.updatedAt)} (BKK)
              </span>
            )}
          </div>

          {/* Search + mode toggle */}
          <div className="relative flex-1 sm:max-w-lg">
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs flex-shrink-0">
                <button
                  onClick={() => handleModeChange('sticker')}
                  className={`px-2.5 py-2 transition-colors ${
                    searchMode === 'sticker' ? 'bg-[#06c755] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Sticker
                </button>
                <button
                  onClick={() => handleModeChange('creator')}
                  className={`px-2.5 py-2 transition-colors ${
                    searchMode === 'creator' ? 'bg-[#06c755] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Creator
                </button>
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={handleInput}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch(query, searchMode)}
                  placeholder={
                    searchMode === 'sticker'
                      ? 'Search stickers e.g. Chiikawa, Tangkwa...'
                      : 'Search by creator name...'
                  }
                  className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm transition-colors bg-white text-gray-900 placeholder:text-gray-400"
                />
              </div>
              <button
                onClick={() => doSearch(query, searchMode)}
                className="px-3 py-2 bg-[#06c755] text-white rounded-xl text-xs font-medium flex-shrink-0 hover:bg-[#05b04a] transition-colors"
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>

            {/* Sticker dropdown */}
            {showDropdown && searchMode === 'sticker' && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-20">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      router.push(`/sticker/${p.id}`);
                      setQuery('');
                      setResults([]);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                      <Image
                        src={`https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`}
                        alt={p.name}
                        width={36}
                        height={36}
                        className="object-contain w-full h-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">ID: {p.id}</p>
                    </div>
                    <span className="text-xs text-green-500 flex-shrink-0">View →</span>
                  </button>
                ))}
              </div>
            )}

            {/* Creator dropdown */}
            {showDropdown && searchMode === 'creator' && creatorResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-20">
                {creatorResults.map((c) => (
                  <button
                    key={c.author}
                    onClick={() => {
                      router.push(`/creator/${encodeURIComponent(c.author)}`);
                      setQuery('');
                      setCreatorResults([]);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                  >
                    <span className="text-sm font-medium text-gray-700">👤 {c.author}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{c.count} packs</span>
                  </button>
                ))}
              </div>
            )}

            {/* No results */}
            {showDropdown && !searching &&
              ((searchMode === 'sticker' && results.length === 0) ||
                (searchMode === 'creator' && creatorResults.length === 0)) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg p-4 text-center text-sm text-gray-400 z-20">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}
          </div>

          {dashboard?.updatedAt && (
            <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
              Updated {toThaiTime(dashboard.updatedAt)} (BKK)
            </span>
          )}

        </div>

        {/* Favorites toggle — flex-wrap so the pills reflow onto a second line on narrow phones
            instead of overflowing the header. */}
        <div className="max-w-6xl mx-auto px-4 pb-0 flex flex-wrap items-center gap-2 border-t border-gray-50 py-1.5">
          <a
            href="/favorites"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-400 border border-gray-200 transition-colors"
          >
            {/* ♥ is a text glyph, not a colour emoji, so it takes `color` directly — unlike the
                padlock on the Revenue pill, which needs a grayscale filter. */}
            <span className="text-red-500" aria-hidden>♥</span>
            Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}
          </a>
          <a
            href="/creators"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200 transition-colors"
          >
            🏅 Top Creators
          </a>
          <a
            href="/categories"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200 transition-colors"
          >
            🗂️ Categories
          </a>
          <a
            href="/characters"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200 transition-colors"
          >
            🐾 Characters
          </a>
          {revenueLink}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-10">

        {/* Hero — the <h1> carries the "LINE sticker ranking" keyword for SEO AND is now the real
            visual headline. The LIVE pill promotes the freshness (the whole product) that used to
            be a 12px gray timestamp. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {relUpdated ? `Live · updated ${relUpdated}` : 'Live rankings'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 leading-tight">
            Live LINE sticker rankings — Japan, Thailand and Taiwan
          </h1>
          <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">
            Top 500 charts refreshed every hour straight from LINE Store, with 30-day rank history and the biggest movers.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => setShowCountryPicker(true)}
              className="text-sm font-medium bg-[#06c755] text-white px-4 py-2 rounded-xl hover:bg-[#05b34c] transition-colors"
            >
              Explore rankings
            </button>
            <a
              href="/favorites"
              className="text-sm font-medium bg-white text-green-700 border border-green-200 px-4 py-2 rounded-xl hover:bg-green-50 transition-colors"
            >
              Track your pack
            </a>
            <span className="text-xs text-gray-400 sm:ml-auto w-full sm:w-auto">
              1,500 live ranks · 3 countries
              {hotMoversCount > 0 ? (
                <>
                  {' · '}
                  <span aria-hidden>🔥 </span>
                  {hotMoversCount} big movers today
                </>
              ) : ''}
            </span>
          </div>
        </div>

        {/* Top 5 Section */}
        <section id="top5" className="scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700 text-base">🏆 Top 5 per country</h2>
            <span className="text-xs text-gray-400 hidden sm:inline">Tap a sticker for its 30-day history</span>
          </div>

            {loadingDash && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-72" />
                ))}
              </div>
            )}

            {!loadingDash && !dashboard?.countries?.length && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                <p className="text-4xl mb-3">⏳</p>
                <p className="text-sm">Rankings are updating right now. Check back in a few minutes.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {dashboard?.countries.filter((c) => HOME_COUNTRIES.includes(c.code)).map((country) => (
                <div
                  key={country.code}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
                >
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                    <span className="text-xl">{country.flag}</span>
                    <span className="font-semibold text-sm text-gray-700">{country.name}</span>
                    <span className="ml-auto text-[11px] uppercase tracking-wide text-gray-300 font-semibold">Top 5</span>
                  </div>
                  <div className="p-2 flex-1">
                    {country.top5.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors group"
                      >
                        <Link href={`/sticker/${item.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                          <RankBadge rank={item.rank} />
                          <Thumb id={item.id} name={item.name} image_url={item.image_url} size={48} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 font-medium truncate group-hover:text-green-700 leading-tight">
                              {item.name}
                            </div>
                            {item.spark.length >= 2 && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <Sparkline ranks={item.spark} />
                                <span className="text-[11px] text-gray-400 flex-shrink-0 leading-none">past 7 days</span>
                              </div>
                            )}
                          </div>
                          <DeltaChip delta={item.delta} isNew={item.isNew} />
                        </Link>
                        <button
                          onClick={() => toggle(item.id)}
                          aria-label={isFavorite(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                          className="flex-shrink-0 text-lg leading-none px-1 transition-colors"
                        >
                          <span className={isFavorite(item.id) ? 'text-red-400' : 'text-gray-300 hover:text-red-400'}>
                            {isFavorite(item.id) ? '♥' : '♡'}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2.5 border-t border-gray-50">
                    <a
                      href={`/country/${country.code}`}
                      className="text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg py-2 w-full text-center block transition-colors"
                    >
                      View full ranking →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

        {/* Movers Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700 text-base">🔥 Movers — biggest jumps today</h2>
            {(() => {
              const w = trending?.countries.find((c) => c.to);
              return w ? (
                <p className="text-xs text-gray-400">
                  {toThaiHM(w.from)} → {toThaiHM(w.to)} (BKK)
                </p>
              ) : null;
            })()}
          </div>

          {loadingTrend && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-52" />
              ))}
            </div>
          )}

          {!loadingTrend && !trending?.countries?.length && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
              <p className="text-3xl mb-2">⏱️</p>
              <p className="text-sm">Today&apos;s movers appear as the day&apos;s hourly snapshots build up.</p>
              <p className="text-xs text-gray-300 mt-1">Rankings refresh every hour around :30 (BKK).</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {trending?.countries.filter((c) => HOME_COUNTRIES.includes(c.code)).map((country) => (
              <div
                key={country.code}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                  <span className="text-xl">{country.flag}</span>
                  <span className="font-semibold text-sm text-gray-700">{country.name}</span>
                </div>
                <div className="p-2">
                  {country.trending.map((item) => (
                    <Link
                      key={item.id}
                      href={`/sticker/${item.id}`}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors text-left group"
                    >
                      <span className="flex-shrink-0 w-10 text-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-600 tabular-nums">
                        <span aria-hidden>▲{item.improvement}</span>
                        <span className="sr-only">up {item.improvement} places</span>
                      </span>
                      <Thumb id={item.id} name={item.name} image_url={item.image_url} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 font-medium truncate group-hover:text-green-700 leading-tight">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-gray-400 leading-tight tabular-nums">
                          now #{item.current_rank} · was #{item.old_rank}
                        </div>
                      </div>
                      {item.improvement >= HOT_JUMP && (
                        <span className="flex-shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                          <span aria-hidden>🔥 </span>Hot
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Server-rendered answers + FAQ. This block is in the initial HTML (no JS needed), so AI
            answer engines can read and cite the current #1 stickers, the hourly cadence, coverage
            and methodology. Freshness is stated as an absolute date (a strong GEO signal). */}
        <section aria-labelledby="faq-heading" className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 id="faq-heading" className="font-bold text-gray-800 text-lg mb-4">
            LINE sticker rankings — questions &amp; answers
          </h2>
          {updatedAbs && (
            <p className="text-xs text-gray-400 mb-4">Rankings last updated {updatedAbs}.</p>
          )}
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-sm font-semibold text-gray-700">{f.q}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <JsonLd data={homeJsonLd} />
        <Footer />
      </main>

      {/* Country picker — opened by the hero "Explore rankings" button. Pick a country → its
          full Top 50 page. */}
      {showCountryPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a country"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCountryPicker(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6">
            <button
              onClick={() => setShowCountryPicker(false)}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xl leading-none transition-colors"
            >
              ×
            </button>
            <h2 className="font-bold text-gray-800 text-lg">Explore rankings</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">Pick a country to see its full Top 50.</p>
            <div className="space-y-2">
              {HOME_COUNTRY_CHIPS.map((c) => (
                <a
                  key={c.code}
                  href={`/country/${c.code}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
                >
                  <span className="text-2xl" aria-hidden>{c.flag}</span>
                  <span className="font-medium text-gray-700">{c.name}</span>
                  <span className="ml-auto text-xs text-gray-400">Top 50 →</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <AdPopup />
    </div>
  );
}
