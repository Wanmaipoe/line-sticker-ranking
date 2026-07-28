'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import TypeBadge from '@/components/TypeBadge';
import BackButton from '@/components/BackButton';

interface RankItem {
  rank: number;
  id: string;
  name: string;
  image_url: string | null;
  author: string | null;
  sticker_type: string | null;
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">Main</a>
        </div>

        <div className="mt-5 mb-6 flex items-center gap-3">
          <span className="text-4xl">{flag}</span>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{name} — Top 50</h1>
            {date && <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">As of {date}</p>}
          </div>
        </div>

        {!items.length ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">No data for {code.toUpperCase()} yet</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:ring-1 dark:ring-white/10 border border-gray-100 dark:border-gray-800 overflow-hidden">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => router.push(`/sticker/${item.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0 cursor-pointer group"
              >
                <span
                  className={`text-sm font-bold w-8 text-right flex-shrink-0 ${
                    item.rank === 1
                      ? 'text-yellow-500 dark:text-yellow-400'
                      : item.rank <= 3
                      ? 'text-orange-400 dark:text-orange-300'
                      : item.rank <= 10
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}
                >
                  #{item.rank}
                </span>
                <Link
                  href={`/sticker/${item.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 flex-shrink-0 block"
                >
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
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/sticker/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate group-hover:text-green-700 dark:group-hover:text-green-300"
                    >
                      {item.name}
                    </Link>
                    <TypeBadge type={item.sticker_type} />
                  </div>
                  {item.author && (
                    <Link
                      href={`/creator/${encodeURIComponent(item.author)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 truncate block"
                    >
                      {item.author}
                    </Link>
                  )}
                </div>
                <button
                  className={`text-xl flex-shrink-0 transition-colors ${
                    isFavorite(item.id) ? 'text-red-400 dark:text-red-400' : 'text-gray-200 dark:text-gray-700 hover:text-red-300'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(item.id);
                  }}
                >
                  ♥
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
