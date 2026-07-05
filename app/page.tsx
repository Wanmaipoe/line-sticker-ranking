'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import Sparkline from '@/components/Sparkline';
import Footer from '@/components/Footer';
import AdPopup from '@/components/AdPopup';

type SearchMode = 'sticker' | 'creator';

// Homepage shows only the three core markets. ID/US are still scraped hourly and keep their
// own /country pages + rows on sticker detail pages — this is a display filter, not a data cut,
// so restoring them here is a one-line change.
const HOME_COUNTRIES = ['jp', 'th', 'tw'];

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

// Rank badge. The podium (1/2/3) renders as a real gold/silver/bronze medal disc so the top three
// pop (Von Restorff — one clear focal point per card); 4/5 stay as a plain muted number.
const MEDAL: Record<number, string> = {
  1: 'bg-[#f5c518] text-yellow-900 ring-1 ring-[#d4a800]', // gold
  2: 'bg-[#c9ccd1] text-gray-700 ring-1 ring-[#a9adb3]', // silver
  3: 'bg-[#cd7f32] text-white ring-1 ring-[#a4641f]', // bronze
};
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${MEDAL[rank]}`}
        title={`Rank ${rank}`}
      >
        {rank}
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

export default function HomePage() {
  const router = useRouter();
  const { favorites, isFavorite, toggle } = useFavorites();
  const searchRef = useRef<HTMLInputElement>(null);

  // Jump to the search box in creator mode — the hero's "Track your pack" CTA for creators.
  function focusCreatorSearch() {
    handleModeChange('creator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => searchRef.current?.focus(), 300);
  }

  // Search
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('sticker');
  const [results, setResults] = useState<Product[]>([]);
  const [creatorResults, setCreatorResults] = useState<CreatorResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Dashboard / trending
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trending, setTrending] = useState<TrendingData | null>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setDashboard)
      .catch(() => setDashboard({ date: null, updatedAt: null, countries: [] }))
      .finally(() => setLoadingDash(false));

    fetch('/api/trending')
      .then((r) => r.json())
      .then(setTrending)
      .catch(() => setTrending(null))
      .finally(() => setLoadingTrend(false));
  }, []);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(debounce(doSearch, 350), [doSearch]);

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
  // payload (zero extra DB reads): how many stickers jumped 30+ places this hour across JP/TH/TW.
  const hotMoversCount =
    trending?.countries
      .filter((c) => HOME_COUNTRIES.includes(c.code))
      .reduce((n, c) => n + c.trending.filter((t) => t.improvement >= 30).length, 0) ?? 0;

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
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={handleInput}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch(query, searchMode)}
                  placeholder={
                    searchMode === 'sticker'
                      ? 'Search stickers e.g. Chiikawa, Tangkwa...'
                      : 'Search by creator name...'
                  }
                  className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm transition-colors"
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

        {/* Favorites toggle */}
        <div className="max-w-6xl mx-auto px-4 pb-0 flex items-center gap-2 border-t border-gray-50 py-1.5">
          <a
            href="/favorites"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-400 border border-gray-200 transition-colors"
          >
            ♥ Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}
          </a>
          <a
            href="/creators"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200 transition-colors"
          >
            🏅 Top Creators
          </a>
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
              {dashboard?.updatedAt ? `Live · updated ${toRelative(dashboard.updatedAt)}` : 'Live rankings'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 leading-tight">
            Live LINE sticker rankings — Japan, Thailand and Taiwan
          </h1>
          <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">
            Top 500 charts refreshed every hour straight from LINE Store, with 30-day rank history and the biggest movers.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <a
              href="#top5"
              className="text-sm font-medium bg-[#06c755] text-white px-4 py-2 rounded-xl hover:bg-[#05b34c] transition-colors"
            >
              Explore rankings
            </a>
            <button
              onClick={focusCreatorSearch}
              className="text-sm font-medium bg-white text-green-700 border border-green-200 px-4 py-2 rounded-xl hover:bg-green-50 transition-colors"
            >
              Track your pack
            </button>
            <span className="text-xs text-gray-400 sm:ml-auto w-full sm:w-auto">
              1,500 live ranks · 3 countries
              {hotMoversCount > 0 ? (
                <>
                  {' · '}
                  <span aria-hidden>🔥 </span>
                  {hotMoversCount} big movers this hour
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
            <h2 className="font-bold text-gray-700 text-base">🔥 Movers — biggest jumps since the last update</h2>
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
              <p className="text-sm">Collecting hourly data — movers appear once two consecutive hourly snapshots exist.</p>
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
                      {item.improvement >= 30 && (
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

        <Footer />
      </main>
      <AdPopup />
    </div>
  );
}
