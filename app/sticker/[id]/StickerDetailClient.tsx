'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import GlobalRankTable from '@/components/GlobalRankTable';
import RankGraph from '@/components/RankGraph';
import { COUNTRY_MAP } from '@/lib/countries';

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
  initialRankings: RankRow[];
}

export default function StickerDetailClient({ id, name, imageUrl, initialRankings }: Props) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="text-sm text-green-600 hover:underline">← LineStickerRanking</a>
        </div>

        {/* Sticker Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex items-center gap-4">
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
            <h1 className="text-lg font-bold text-gray-800 truncate">{name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Product ID: {id}</p>
            <a
              href={`https://store.line.me/stickershop/product/${id}/th`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-500 hover:underline mt-1 inline-block"
            >
              Open in LINE Store ↗
            </a>
          </div>
          <button
            onClick={refreshRankings}
            disabled={refreshing}
            className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>

        {/* Global Rank Matrix */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700">Global rank matrix</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              Click a row to view graph
            </span>
          </div>
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
