'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import StickersRankTable, { ProductWithRankings } from '@/components/StickersRankTable';

type SearchMode = 'sticker' | 'creator';

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

export default function HomePage() {
  const router = useRouter();
  const { favorites, isFavorite, toggle, loaded: favLoaded } = useFavorites();

  // Search
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('sticker');
  const [results, setResults] = useState<Product[]>([]);
  const [creatorResults, setCreatorResults] = useState<CreatorResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Favorites panel toggle
  const [showFavorites, setShowFavorites] = useState(false);

  // Dashboard / trending
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trending, setTrending] = useState<TrendingData | null>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);

  // Favorites data
  const [favoritesData, setFavoritesData] = useState<ProductWithRankings[]>([]);
  const [loadingFav, setLoadingFav] = useState(false);
  const favoritesKey = favorites.join(',');

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

  useEffect(() => {
    if (!showFavorites || !favLoaded) return;
    if (!favoritesKey) {
      setFavoritesData([]);
      return;
    }
    setLoadingFav(true);
    fetch(`/api/favorites?ids=${favoritesKey}`)
      .then((r) => r.json())
      .then((d) => setFavoritesData(d.products ?? []))
      .catch(() => setFavoritesData([]))
      .finally(() => setLoadingFav(false));
  }, [showFavorites, favoritesKey, favLoaded]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Image src="/mascot.png" alt="Bowl Cut Piggo" width={36} height={36} className="object-contain" />
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
          <button
            onClick={() => setShowFavorites((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              showFavorites
                ? 'bg-red-50 text-red-400 border border-red-200'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            ♥ Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}
          </button>
          <a
            href="/creators"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200 transition-colors"
          >
            🏅 Top Creators
          </a>
          {showFavorites && (
            <span className="text-xs text-gray-400 hidden sm:inline">— click ♥ on any sticker detail page to save</span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-10">

        {/* Tagline */}
        <div className="text-center pt-2 pb-1">
          <p className="text-sm text-gray-500">See which LINE stickers are trending — rankings refreshed every hour across 18 countries, straight from LINE.</p>
          <p className="text-sm text-gray-400 mt-1">Click any sticker to explore its full rank history. Save your picks to ♥ Favorites to track their progress over time.</p>
        </div>

        {/* Favorites Panel */}
        {showFavorites && (
          <section className="bg-white rounded-2xl shadow-sm border border-red-100 p-5">
            <h2 className="font-bold text-gray-700 text-base mb-4">♥ Saved Favorites</h2>
            {!favLoaded || loadingFav ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
            ) : favorites.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-3xl mb-2">♡</p>
                <p className="text-sm">No favorites yet — open a sticker and tap ♥ to save it here</p>
              </div>
            ) : (
              <StickersRankTable
                products={favoritesData}
                isFavorite={isFavorite}
                onToggleFavorite={toggle}
                showAuthorLink
              />
            )}
          </section>
        )}

        {/* Top 5 Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700 text-base">🏆 Top 5 Per Country Today</h2>
            <span className="text-xs text-gray-400">Click a sticker to see full ranking history</span>
          </div>

            {loadingDash && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-52" />
                ))}
              </div>
            )}

            {!loadingDash && !dashboard?.countries?.length && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-sm">No data yet — wait for the cron job or run the seed script</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {dashboard?.countries.map((country) => (
                <div
                  key={country.code}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
                >
                  <div className="px-3 py-2.5 border-b border-gray-50 flex items-center gap-2">
                    <span className="text-xl">{country.flag}</span>
                    <span className="font-semibold text-sm text-gray-700">{country.name}</span>
                  </div>
                  <div className="p-2 flex-1">
                    {country.top5.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => router.push(`/sticker/${item.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors text-left group"
                      >
                        <span
                          className={`text-xs font-bold w-5 text-right flex-shrink-0 ${
                            item.rank === 1
                              ? 'text-yellow-500'
                              : item.rank === 2
                              ? 'text-gray-400'
                              : item.rank === 3
                              ? 'text-orange-400'
                              : 'text-gray-300'
                          }`}
                        >
                          #{item.rank}
                        </span>
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            width={32}
                            height={32}
                            className="object-contain w-full h-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.visibility = 'hidden';
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 truncate group-hover:text-green-700 leading-tight">
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-gray-50">
                    <a
                      href={`/country/${country.code}`}
                      className="text-xs text-green-500 hover:text-green-600 font-medium w-full text-center block"
                    >
                      More → Top 50
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {trending?.countries.map((country) => (
              <div
                key={country.code}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-3 py-2.5 border-b border-gray-50 flex items-center gap-2">
                  <span className="text-xl">{country.flag}</span>
                  <span className="font-semibold text-sm text-gray-700">{country.name}</span>
                </div>
                <div className="p-2">
                  {country.trending.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/sticker/${item.id}`)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors text-left group"
                    >
                      <span className="text-xs font-bold text-green-500 w-9 text-right flex-shrink-0">
                        ▲{item.improvement}
                      </span>
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          width={32}
                          height={32}
                          className="object-contain w-full h-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.visibility = 'hidden';
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 truncate group-hover:text-green-700 leading-tight flex-1">
                        {item.name}
                      </span>
                      <span className="text-xs text-gray-300 flex-shrink-0">#{item.current_rank}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
