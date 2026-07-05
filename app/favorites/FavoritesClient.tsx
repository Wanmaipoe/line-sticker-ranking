'use client';

import { useState, useEffect } from 'react';
import { useFavorites } from '@/hooks/useFavorites';
import StickersRankTable, { ProductWithRankings } from '@/components/StickersRankTable';
import BackButton from '@/components/BackButton';

// Standalone Favorites page. Favorites are stored per-device in localStorage (via useFavorites);
// this fetches their live rankings on demand from /api/favorites. Reads are spent only when the
// page is opened (and when the saved set changes), never in the background.
export default function FavoritesClient() {
  const { favorites, isFavorite, toggle, loaded } = useFavorites();
  const [products, setProducts] = useState<ProductWithRankings[]>([]);
  const [loading, setLoading] = useState(false);
  const key = favorites.join(',');

  useEffect(() => {
    if (!loaded) return;
    if (!key) {
      setProducts([]);
      return;
    }
    setLoading(true);
    fetch(`/api/favorites?ids=${key}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [key, loaded]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300">·</span>
          <a href="/" className="text-sm text-green-600 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-6">
          <h1 className="text-xl font-bold text-gray-800">♥ Favorites</h1>
          <p className="text-sm text-gray-400 mt-1">
            {favorites.length} sticker pack{favorites.length !== 1 ? 's' : ''} saved on this device
          </p>
        </div>

        {!loaded || loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <p className="text-4xl mb-3">♡</p>
            <p className="text-sm">No favorites yet.</p>
            <p className="text-sm mt-1">
              Tap the ♥ on any sticker in the{' '}
              <a href="/" className="text-green-600 hover:underline">rankings</a> to save it here.
            </p>
          </div>
        ) : (
          <StickersRankTable
            products={products}
            isFavorite={isFavorite}
            onToggleFavorite={toggle}
            showAuthorLink
          />
        )}
      </div>
    </div>
  );
}
