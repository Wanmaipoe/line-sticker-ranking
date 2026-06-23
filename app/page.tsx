'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface Product {
  id: string;
  name: string;
  image_url: string | null;
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
}

interface DashboardData {
  date: string | null;
  updatedAt: string | null;
  countries: CountryBlock[];
}

interface TrendingData {
  countries: TrendingBlock[];
  latestDate: string;
  oldDate: string;
}

function toThaiTime(isoString: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [trending, setTrending] = useState<TrendingData | null>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => setDashboard(d))
      .catch(() => setDashboard({ date: null, updatedAt: null, countries: [] }))
      .finally(() => setLoadingDash(false));

    fetch('/api/trending')
      .then((r) => r.json())
      .then((d) => setTrending(d))
      .catch(() => setTrending(null))
      .finally(() => setLoadingTrend(false));
  }, []);

  const search = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) { setResults([]); return; }
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 350),
    []
  );

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    search(e.target.value);
  }

  const showSearch = query.length >= 2;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Image src="/mascot.png" alt="Bowl Cut Piggo" width={36} height={36} className="object-contain" />
            <span className="font-bold text-gray-800 text-lg">LineStickerRanking</span>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-lg">
            <input
              type="text"
              value={query}
              onChange={handleInput}
              placeholder="Search stickers e.g. Smug, Chiikawa, Tangkwa..."
              className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-[#06c755] focus:outline-none text-sm transition-colors"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Searching...</span>
            )}

            {showSearch && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden z-20">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { router.push(`/sticker/${p.id}`); setQuery(''); setResults([]); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                      <Image
                        src={`https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`}
                        alt={p.name} width={36} height={36}
                        className="object-contain w-full h-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">ID: {p.id}</p>
                    </div>
                    <span className="text-xs text-green-500 flex-shrink-0">View ranking →</span>
                  </button>
                ))}
              </div>
            )}

            {showSearch && results.length === 0 && !searching && (
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
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-10">

        {/* Top 5 Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700 text-base">🏆 Top 5 Per Country Today</h2>
            <span className="text-xs text-gray-400">Click a sticker to see full ranking</span>
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
              <p className="text-sm">No data in database yet</p>
              <p className="text-xs mt-1">Run <code className="bg-gray-100 px-1 rounded">node scripts/seed.mjs</code> to seed data</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {dashboard?.countries.map((country) => (
              <div key={country.code} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-gray-50 flex items-center gap-2">
                  <span className="text-xl">{country.flag}</span>
                  <span className="font-semibold text-sm text-gray-700">{country.name}</span>
                </div>
                <div className="p-2">
                  {country.top5.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/sticker/${item.id}`)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors text-left group"
                    >
                      <span className={`text-xs font-bold w-5 text-right flex-shrink-0 ${
                        item.rank === 1 ? 'text-yellow-500' :
                        item.rank === 2 ? 'text-gray-400' :
                        item.rank === 3 ? 'text-orange-400' : 'text-gray-300'
                      }`}>#{item.rank}</span>
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                        <Image src={item.image_url} alt={item.name} width={32} height={32}
                          className="object-contain w-full h-full"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 truncate group-hover:text-green-700 leading-tight">
                        {item.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trending Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-700 text-base">🔥 Trending — Biggest rank gains in the last 3 days</h2>
              {trending && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Comparing {trending.oldDate} → {trending.latestDate}
                </p>
              )}
            </div>
            <span className="text-xs text-gray-400">Click a sticker to see full ranking</span>
          </div>

          {loadingTrend && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-52" />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {trending?.countries.map((country) => (
              <div key={country.code} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                        <Image src={item.image_url} alt={item.name} width={32} height={32}
                          className="object-contain w-full h-full"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
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
