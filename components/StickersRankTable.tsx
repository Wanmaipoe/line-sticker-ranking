'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { COUNTRY_MAP } from '@/lib/countries';

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'] as const;

export interface ProductWithRankings {
  id: string;
  name: string;
  image_url: string | null;
  author?: string | null;
  rankings: Record<string, number | null>;
}

interface Props {
  products: ProductWithRankings[];
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (id: string) => void;
  showAuthorLink?: boolean;
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-gray-200 text-xs">—</span>;
  return (
    <span
      className={`text-xs font-semibold ${
        rank === 1
          ? 'text-yellow-500'
          : rank <= 3
          ? 'text-orange-400'
          : rank <= 10
          ? 'text-green-600'
          : 'text-gray-500'
      }`}
    >
      #{rank}
    </span>
  );
}

export default function StickersRankTable({ products, isFavorite, onToggleFavorite, showAuthorLink }: Props) {
  const router = useRouter();

  if (!products.length) {
    return <div className="text-center py-12 text-gray-400 text-sm">No stickers found</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2.5 min-w-44">Sticker</th>
            {FEATURED.map((cc) => {
              const info = COUNTRY_MAP[cc];
              return (
                <th key={cc} className="text-center px-3 py-2.5 w-16">
                  {info?.flag} {cc.toUpperCase()}
                </th>
              );
            })}
            {onToggleFavorite && <th className="px-3 py-2.5 w-10" />}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              className="border-t border-gray-50 hover:bg-green-50 transition-colors cursor-pointer"
              onClick={() => router.push(`/sticker/${p.id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                    <Image
                      src={
                        p.image_url ??
                        `https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`
                      }
                      alt={p.name}
                      width={36}
                      height={36}
                      className="object-contain w-full h-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate max-w-36 leading-tight">{p.name}</p>
                    {p.author && (
                      <p
                        className={`text-xs text-gray-400 truncate max-w-36 ${
                          showAuthorLink ? 'hover:text-green-600 cursor-pointer' : ''
                        }`}
                        onClick={
                          showAuthorLink
                            ? (e) => {
                                e.stopPropagation();
                                router.push(`/creator/${encodeURIComponent(p.author!)}`);
                              }
                            : undefined
                        }
                      >
                        {p.author}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              {FEATURED.map((cc) => (
                <td key={cc} className="text-center px-3 py-3">
                  <RankBadge rank={p.rankings[cc] ?? null} />
                </td>
              ))}
              {onToggleFavorite && (
                <td
                  className="px-3 py-3 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(p.id);
                  }}
                >
                  <button
                    className={`text-xl leading-none transition-colors ${
                      isFavorite?.(p.id) ? 'text-red-400' : 'text-gray-200 hover:text-red-300'
                    }`}
                  >
                    ♥
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
