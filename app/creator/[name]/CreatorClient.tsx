'use client';

import { useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import StickersRankTable, { ProductWithRankings } from '@/components/StickersRankTable';
import BackButton from '@/components/BackButton';
import CreatorRankGraph, { CreatorGraphPack, CreatorGraphPoint } from '@/components/CreatorRankGraph';

interface Props {
  author: string;
  products: ProductWithRankings[];
  graphPacksByCountry: Record<string, CreatorGraphPack[]>;
  graphHistory: CreatorGraphPoint[];
  graphDefaultCountry: string;
  rankedByCountry: Record<string, number>;
}

export default function CreatorClient({
  author,
  products: initialProducts,
  graphPacksByCountry,
  graphHistory,
  graphDefaultCountry,
  rankedByCountry,
}: Props) {
  const { isFavorite, toggle } = useFavorites();
  // The page itself is ISR-cached (cheap, but up to ~1h behind the hourly scrape). This lets
  // the team pull the live current rankings on demand. It ONLY fires on an explicit click, so
  // reads are spent per-click (~175 index-seek rows via /api/creator), never in the background.
  const [products, setProducts] = useState<ProductWithRankings[]>(initialProducts);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return; // guard against double / spam clicks so one intent = one read
    setRefreshing(true);
    try {
      const res = await fetch(`/api/creator/${encodeURIComponent(author)}`);
      const data = await res.json();
      if (Array.isArray(data.products)) setProducts(data.products);
    } catch {
      // keep the current data on any failure
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">👤 {author}</h1>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {products.length} sticker pack{products.length !== 1 ? 's' : ''} in rankings
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Fetch the latest rankings now"
            className="text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors disabled:opacity-50 flex-shrink-0 self-start"
          >
            {refreshing ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {/* Ranking history for the creator's currently-ranked packs. Server-rendered from data
            fetched once with the page; the Refresh button above only refreshes the table's live
            ranks, so this chart intentionally does not re-fetch (7-day history barely moves). */}
        {graphHistory.length > 0 && Object.values(graphPacksByCountry).some((p) => p.length > 0) && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Ranking history</h2>
            <CreatorRankGraph
              packsByCountry={graphPacksByCountry}
              history={graphHistory}
              defaultCountry={graphDefaultCountry}
              rankedByCountry={rankedByCountry}
            />
          </div>
        )}

        <StickersRankTable
          products={products}
          isFavorite={isFavorite}
          onToggleFavorite={toggle}
          defaultSortKey="th"
        />
      </div>
    </div>
  );
}
