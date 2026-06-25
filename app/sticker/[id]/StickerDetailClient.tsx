'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import GlobalRankTable from '@/components/GlobalRankTable';
import RankGraph from '@/components/RankGraph';
import TypeBadge from '@/components/TypeBadge';
import AlertSignup from '@/components/AlertSignup';
import { COUNTRY_MAP } from '@/lib/countries';
import { useFavorites } from '@/hooks/useFavorites';

function formatPrice(price: number | null, currency: string | null): string | null {
  if (price == null) return null;
  // New source stores USD in cents; legacy rows may carry other integer currencies.
  if (currency === 'USD') return `$${(price / 100).toFixed(2)}`;
  return `${price.toLocaleString()} ${currency ?? ''}`.trim();
}

interface RankRow {
  country: string;
  current_rank: number;
  snapshot_date: string;
  snapshot_hour: number;
  rank_24h_ago: number | null;
  best_30d: number | null;
}

interface HistoryPoint {
  snapshot_date: string;
  snapshot_hour: number;
  rank: number;
}

interface Props {
  id: string;
  name: string;
  imageUrl: string;
  author: string | null;
  price: number | null;
  priceCurrency: string | null;
  description: string | null;
  stickerType: string | null;
  initialRankings: RankRow[];
}

export default function StickerDetailClient({
  id,
  name,
  imageUrl,
  author,
  price,
  priceCurrency,
  description,
  stickerType,
  initialRankings,
}: Props) {
  const router = useRouter();
  const { isFavorite, toggle, loaded: favLoaded } = useFavorites();
  const [rankings, setRankings] = useState<RankRow[]>(initialRankings);
  const [selectedCountry, setSelectedCountry] = useState<string>(
    initialRankings[0]?.country ?? 'th'
  );
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchHistory(selectedCountry);
  }, [selectedCountry, id]);

  async function fetchHistory(country: string) {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/sticker/${id}/history?country=${country}&days=30`);
      const data = await res.json();
      setHistory(data.history ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function refreshRankings() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/sticker/${id}`);
      const data = await res.json();
      setRankings(data.rankings ?? []);
    } finally {
      setRefreshing(false);
    }
  }

  const countryInfo = COUNTRY_MAP[selectedCountry];
  const favorited = favLoaded && isFavorite(id);

  // Global footprint, computed from the per-country current ranks
  const countriesRanked = rankings.length;
  const bestRank = rankings.length ? Math.min(...rankings.map((r) => r.current_rank)) : null;
  const top10 = rankings.filter((r) => r.current_rank <= 10).length;
  const bestCountry = bestRank != null ? rankings.find((r) => r.current_rank === bestRank)?.country : null;
  const priceLabel = formatPrice(price, priceCurrency);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="text-sm text-green-600 hover:underline">← LineStickerRanking</a>
        </div>

        {/* Sticker Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center flex-shrink-0">
              <Image
                src={imageUrl}
                alt={name}
                width={80}
                height={80}
                className="object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h1 className="text-lg font-bold text-gray-800 leading-snug">{name}</h1>
                  <TypeBadge type={stickerType} />
                </div>
                <button
                  onClick={() => toggle(id)}
                  disabled={!favLoaded}
                  className={`text-2xl flex-shrink-0 transition-colors ${
                    favorited ? 'text-red-400' : 'text-gray-200 hover:text-red-300'
                  }`}
                  title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  ♥
                </button>
              </div>
              {author && (
                <button
                  onClick={() => router.push(`/creator/${encodeURIComponent(author)}`)}
                  className="text-sm text-green-600 hover:underline mt-0.5"
                >
                  👤 {author}
                </button>
              )}
              <p className="text-xs text-gray-400 mt-1">Product ID: {id}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <a
                  href={`https://store.line.me/stickershop/product/${id}/th`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-500 hover:underline"
                >
                  Open in LINE Store ↗
                </a>
                {priceLabel && (
                  <span className="text-xs text-gray-500 font-medium">{priceLabel}</span>
                )}
              </div>
              {description && (
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{description}</p>
              )}
            </div>
            <button
              onClick={refreshRankings}
              disabled={refreshing}
              className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0 self-start"
            >
              {refreshing ? 'Loading...' : '↻ Refresh'}
            </button>
          </div>
          <div className="mt-4">
            <AlertSignup stickerId={id} />
          </div>
        </div>

        {/* Global Rank Matrix */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700">Global rank matrix</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              Click a row to view graph
            </span>
          </div>

          {/* Global footprint */}
          {countriesRanked > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-700 leading-none">{countriesRanked}</p>
                <p className="text-[11px] text-gray-400 mt-1">countries ranked</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-green-600 leading-none">
                  #{bestRank}
                  {bestCountry && <span className="text-xs"> {COUNTRY_MAP[bestCountry]?.flag}</span>}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">best rank</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-gray-700 leading-none">{top10}</p>
                <p className="text-[11px] text-gray-400 mt-1">top 10 markets</p>
              </div>
            </div>
          )}

          <GlobalRankTable
            rows={rankings}
            selectedCountry={selectedCountry}
            onSelectCountry={setSelectedCountry}
          />
        </div>

        {/* Graph Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-700 mb-4">Ranking history</h2>
          {loadingHistory ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Loading...
            </div>
          ) : (
            <RankGraph
              data={history}
              countryName={countryInfo?.name ?? selectedCountry.toUpperCase()}
              countryFlag={countryInfo?.flag ?? '🌏'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
