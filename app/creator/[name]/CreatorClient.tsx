'use client';

import { useFavorites } from '@/hooks/useFavorites';
import StickersRankTable, { ProductWithRankings } from '@/components/StickersRankTable';

interface Props {
  author: string;
  products: ProductWithRankings[];
}

export default function CreatorClient({ author, products }: Props) {
  const { isFavorite, toggle } = useFavorites();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <a href="/" className="text-sm text-green-600 hover:underline">
          ← LineStickerRanking
        </a>

        <div className="mt-5 mb-6">
          <h1 className="text-xl font-bold text-gray-800">👤 {author}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {products.length} sticker pack{products.length !== 1 ? 's' : ''} in rankings
          </p>
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
