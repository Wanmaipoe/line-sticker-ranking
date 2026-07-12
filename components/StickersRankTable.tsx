'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COUNTRY_MAP } from '@/lib/countries';
import TypeBadge from '@/components/TypeBadge';

const FEATURED = ['jp', 'th', 'tw', 'id', 'us'] as const;
const MOBILE_HIDDEN = new Set(['id', 'us']);

export interface ProductWithRankings {
  id: string;
  name: string;
  image_url: string | null;
  author?: string | null;
  sticker_type?: string | null;
  rankings: Record<string, number | null>;
}

interface Props {
  products: ProductWithRankings[];
  isFavorite?: (id: string) => boolean;
  onToggleFavorite?: (id: string) => void;
  showAuthorLink?: boolean;
  // Country code to sort by on first render (ascending, best rank first). Unranked (—) sink to the
  // bottom. The user can still click any column to re-sort. Omit for the original server order.
  defaultSortKey?: string;
}

function rankColor(rank: number): string {
  return rank === 1 ? 'text-yellow-500' : rank <= 3 ? 'text-orange-400' : rank <= 10 ? 'text-green-600' : 'text-gray-500';
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-gray-200 text-xs">—</span>;
  return <span className={`text-xs font-semibold ${rankColor(rank)}`}>#{rank}</span>;
}

// Sticker thumbnail linking to the detail page (shared by the desktop table + mobile cards).
function Thumb({ id, name, image_url }: { id: string; name: string; image_url: string | null }) {
  return (
    <Link
      href={`/sticker/${id}`}
      onClick={(e) => e.stopPropagation()}
      className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 block"
    >
      <Image
        src={image_url ?? `https://stickershop.line-scdn.net/stickershop/v1/product/${id}/LINEStorePC/main.png`}
        alt={name}
        width={36}
        height={36}
        className="object-contain w-full h-full"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
    </Link>
  );
}

export default function StickersRankTable({ products, isFavorite, onToggleFavorite, showAuthorLink, defaultSortKey }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    defaultSortKey ? { key: defaultSortKey, dir: 'asc' } : null
  );

  function toggleSort(cc: string) {
    setSort((prev) => (prev?.key === cc ? { key: cc, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: cc, dir: 'asc' }));
  }

  // Sort by a country's rank; unranked (—) always sink to the bottom regardless of direction.
  const sortedProducts = sort
    ? [...products].sort((a, b) => {
        const ar = a.rankings[sort.key];
        const br = b.rankings[sort.key];
        if (ar == null && br == null) return 0;
        if (ar == null) return 1;
        if (br == null) return -1;
        return sort.dir === 'asc' ? ar - br : br - ar;
      })
    : products;

  if (!products.length) {
    return <div className="text-center py-12 text-gray-400 text-sm">No stickers found</div>;
  }

  return (
    <>
      {/* Mobile (< sm): the wide table doesn't fit a phone, so show a card per sticker with every
          country's rank inline as chips — no horizontal scroll — plus a sort-by-country control. */}
      <div className="sm:hidden rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 overflow-x-auto">
          <span className="text-[11px] text-gray-400 flex-shrink-0 uppercase tracking-wide">Sort</span>
          {FEATURED.map((cc) => {
            const info = COUNTRY_MAP[cc];
            const active = sort?.key === cc;
            return (
              <button
                key={cc}
                onClick={() => toggleSort(cc)}
                className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg border transition-colors ${
                  active ? 'border-green-200 bg-green-50 text-green-700 font-medium' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {info?.flag} {cc.toUpperCase()}
                {active && <span className="ml-0.5">{sort!.dir === 'asc' ? '▲' : '▼'}</span>}
              </button>
            );
          })}
        </div>
        <div className="divide-y divide-gray-50">
          {sortedProducts.map((p) => (
            <div
              key={p.id}
              className="px-3 py-3 active:bg-green-50 transition-colors"
              onClick={() => router.push(`/sticker/${p.id}`)}
            >
              <div className="flex items-center gap-2.5">
                <Thumb id={p.id} name={p.name} image_url={p.image_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/sticker/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-gray-700 truncate leading-tight"
                    >
                      {p.name}
                    </Link>
                    <TypeBadge type={p.sticker_type} />
                  </div>
                  {p.author &&
                    (showAuthorLink ? (
                      <Link
                        href={`/creator/${encodeURIComponent(p.author)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-gray-400 truncate hover:text-green-600 block"
                      >
                        {p.author}
                      </Link>
                    ) : (
                      <p className="text-xs text-gray-400 truncate">{p.author}</p>
                    ))}
                </div>
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(p.id);
                    }}
                    aria-label="Toggle favorite"
                    className={`text-xl leading-none flex-shrink-0 ${isFavorite?.(p.id) ? 'text-red-400' : 'text-gray-200'}`}
                  >
                    ♥
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {FEATURED.map((cc) => {
                  const info = COUNTRY_MAP[cc];
                  const rank = p.rankings[cc] ?? null;
                  const active = sort?.key === cc;
                  return (
                    <span
                      key={cc}
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${
                        active ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <span>{info?.flag}</span>
                      <span className="text-gray-400">{cc.toUpperCase()}</span>
                      {rank == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={`font-semibold ${rankColor(rank)}`}>#{rank}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop (sm+): the full sortable table. */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-4 py-2.5 min-w-44">Sticker</th>
            {FEATURED.map((cc) => {
              const info = COUNTRY_MAP[cc];
              const active = sort?.key === cc;
              return (
                <th
                  key={cc}
                  onClick={() => toggleSort(cc)}
                  title={`Sort by ${info?.name ?? cc.toUpperCase()} rank`}
                  className={`text-center px-3 py-2.5 w-16 cursor-pointer select-none hover:text-gray-700 transition-colors ${
                    MOBILE_HIDDEN.has(cc) ? 'hidden sm:table-cell' : ''
                  } ${active ? 'text-green-600' : ''}`}
                >
                  {info?.flag} {cc.toUpperCase()}
                  <span className={`ml-0.5 ${active ? '' : 'text-gray-300'}`}>{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
              );
            })}
            {onToggleFavorite && <th className="px-3 py-2.5 w-10" />}
          </tr>
        </thead>
        <tbody>
          {sortedProducts.map((p) => (
            <tr
              key={p.id}
              className="border-t border-gray-50 hover:bg-green-50 transition-colors cursor-pointer"
              onClick={() => router.push(`/sticker/${p.id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/sticker/${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 block"
                  >
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
                  </Link>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/sticker/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium text-gray-700 truncate leading-tight hover:text-green-700"
                      >
                        {p.name}
                      </Link>
                      <TypeBadge type={p.sticker_type} />
                    </div>
                    {p.author &&
                      (showAuthorLink ? (
                        <Link
                          href={`/creator/${encodeURIComponent(p.author)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-gray-400 truncate hover:text-green-600 block"
                        >
                          {p.author}
                        </Link>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">{p.author}</p>
                      ))}
                  </div>
                </div>
              </td>
              {FEATURED.map((cc) => (
                <td key={cc} className={`text-center px-3 py-3 ${MOBILE_HIDDEN.has(cc) ? 'hidden sm:table-cell' : ''}`}>
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
    </>
  );
}
