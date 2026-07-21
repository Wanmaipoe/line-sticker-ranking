'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP } from '@/lib/countries';
import { STICKER_CATEGORIES, CATEGORY_MAP } from '@/lib/categories';
import type { CountryCategoryData, CategoryRankItem } from '@/lib/db';

// A category needs at least this many packs across the three markets combined to earn a tab —
// otherwise a "ranking" of one or two stickers looks broken. Stickers/Animated/Pop-up always pass;
// Custom/Message appear only when they actually have a presence.
const MIN_TOTAL_FOR_TAB = 3;

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500';
  if (rank <= 3) return 'text-orange-400';
  if (rank <= 10) return 'text-green-600';
  return 'text-gray-400';
}

function CategoryColumn({
  data,
  categoryKey,
}: {
  data: CountryCategoryData;
  categoryKey: string;
}) {
  const info = COUNTRY_MAP[data.country];
  const items: CategoryRankItem[] = data.byCategory[categoryKey] ?? [];
  const total = data.counts[categoryKey] ?? 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="font-bold text-gray-700 text-sm">
          {info?.flag} {info?.name ?? data.country.toUpperCase()}
        </span>
        <span className="text-[11px] text-gray-400">{total} in top 500</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-8 text-center">
          None in {info?.name ?? data.country.toUpperCase()}&apos;s current top 500.
        </p>
      ) : (
        <ol className="divide-y divide-gray-50">
          {items.map((it, i) => (
            <li key={it.id}>
              <a
                href={`/sticker/${it.id}`}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-green-50/60 transition-colors"
              >
                {/* Category position (#1 within this type), not the overall rank. */}
                <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">
                  {i + 1}
                </span>
                <span className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
                  <Image
                    src={
                      it.image_url ??
                      `https://stickershop.line-scdn.net/stickershop/v1/product/${it.id}/LINEStorePC/main.png`
                    }
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                    className="object-contain w-full h-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-700 truncate">{it.name}</span>
                  {it.author && <span className="block text-[11px] text-gray-400 truncate">{it.author}</span>}
                </span>
                {/* The pack's overall rank in the country, for context. */}
                <span className={`text-[11px] font-medium flex-shrink-0 ${rankClass(it.rank)}`}>
                  #{it.rank} overall
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function CategoriesClient({
  data,
  latestDate,
}: {
  data: CountryCategoryData[];
  latestDate: string | null;
}) {
  // Which categories have enough presence across the markets to show a tab.
  const available = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) {
      for (const [cat, n] of Object.entries(d.counts)) {
        totals.set(cat, (totals.get(cat) ?? 0) + n);
      }
    }
    return STICKER_CATEGORIES.filter((c) => (totals.get(c.key) ?? 0) >= MIN_TOTAL_FOR_TAB).map((c) => ({
      ...c,
      total: totals.get(c.key) ?? 0,
    }));
  }, [data]);

  // Default to Animated — the most interesting differentiated view — else the first available.
  const [selected, setSelected] = useState<string>(
    () => available.find((c) => c.key === 'animated')?.key ?? available[0]?.key ?? 'stickers'
  );

  if (!data.length || !available.length) {
    return (
      <p className="mt-6 text-sm text-gray-400 bg-white border border-gray-100 rounded-2xl px-4 py-10 text-center">
        No category data available right now. It fills in as the scraper runs.
      </p>
    );
  }

  const cat = CATEGORY_MAP[selected];

  return (
    <div className="mt-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {available.map((c) => (
          <button
            key={c.key}
            onClick={() => setSelected(c.key)}
            // These pills toggle which category the columns show. aria-pressed exposes the active
            // one to screen readers — otherwise the only selected cue is colour (fails WCAG 1.4.1 /
            // 4.1.2), so an AT or colour-blind user can't tell which category is showing.
            aria-pressed={selected === c.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selected === c.key
                ? 'bg-[#06c755] text-white border-[#06c755]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span aria-hidden>{c.emoji}</span> {c.label}
            <span className={selected === c.key ? 'text-green-100' : 'text-gray-400'}>{c.total}</span>
          </button>
        ))}
      </div>

      {cat && <p className="text-xs text-gray-400 mt-2">{cat.blurb}</p>}

      {/* Three markets side by side (stacks on mobile). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {data.map((d) => (
          <CategoryColumn key={d.country} data={d} categoryKey={selected} />
        ))}
      </div>

      {latestDate && (
        <p className="text-xs text-gray-400 mt-4">
          Ranked by each pack&apos;s overall position in its market&apos;s top 500. Updated hourly from store.line.me.
        </p>
      )}
    </div>
  );
}
