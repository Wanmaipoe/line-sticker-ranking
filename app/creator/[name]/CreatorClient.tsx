'use client';

import { useState } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import StickersRankTable, { ProductWithRankings } from '@/components/StickersRankTable';
import BackButton from '@/components/BackButton';

interface Props {
  author: string;
  products: ProductWithRankings[];
}

export default function CreatorClient({ author, products: initialProducts }: Props) {
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <a href="/" className="text-sm text-green-600 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">👤 {author}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {products.length} sticker pack{products.length !== 1 ? 's' : ''} in rankings
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Fetch the latest rankings now"
            className="text-xs bg-green-50 text-green-600 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0 self-start"
          >
            {refreshing ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        <StickersRankTable
          products={products}
          isFavorite={isFavorite}
          onToggleFavorite={toggle}
        />
      </div>
    </div>
  );
}
