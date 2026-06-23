'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';

interface RankItem {
  rank: number;
  id: string;
  name: string;
  image_url: string | null;
  author: string | null;
}

interface Props {
  code: string;
  name: string;
  flag: string;
  date: string | null;
  items: RankItem[];
}

export default function CountryClient({ code, name, flag, date, items }: Props) {
  const router = useRouter();
  const { isFavorite, toggle } = useFavorites();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <a href="/" className="text-sm text-green-600 hover:underline">
          ← LineStickerRanking
        </a>

        <div className="mt-5 mb-6 flex items-center gap-3">
          <span className="text-4xl">{flag}</span>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{name} — Top 50</h1>
            {date && <p className="text-sm text-gray-400 mt-0.5">As of {date}</p>}
          </div>
        </div>

        {!items.length ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">No data for {code.toUpperCase()} yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(`/sticker/${item.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0 text-left group"
              >
                <span
                  className={`text-sm font-bold w-8 text-right flex-shrink-0 ${
                    item.rank === 1
                      ? 'text-yellow-500'
                      : item.rank <= 3
                      ? 'text-orange-400'
                      : item.rank <= 10
                      ? 'text-green-600'
                      : 'text-gray-300'
                  }`}
                >
                  #{item.rank}
                </span>
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
                  <Image
                    src={
                      item.image_url ??
                      `https://stickershop.line-scdn.net/stickershop/v1/product/${item.id}/LINEStorePC/main.png`
                    }
                    alt={item.name}
                    width={40}
                    height={40}
                    className="object-contain w-full h-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate group-hover:text-green-700">
                    {item.name}
                  </p>
                  {item.author && (
                    <p
                      className="text-xs text-gray-400 hover:text-green-600 cursor-pointer truncate"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/creator/${encodeURIComponent(item.author!)}`);
                      }}
                    >
                      {item.author}
                    </p>
                  )}
                </div>
                <button
                  className={`text-xl flex-shrink-0 transition-colors ${
                    isFavorite(item.id) ? 'text-red-400' : 'text-gray-200 hover:text-red-300'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(item.id);
                  }}
                >
                  ♥
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
