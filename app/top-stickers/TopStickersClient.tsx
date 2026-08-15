'use client';

import { useState } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP } from '@/lib/countries';
import TypeBadge from '@/components/TypeBadge';
import { UNRANKED_RANK } from '@/lib/ranking';
import type { GlobalStickerRanking } from '@/lib/db';

function rankClass(rank: number) {
  if (rank === 1) return 'text-yellow-500 dark:text-yellow-400 font-bold';
  if (rank <= 3) return 'text-orange-400 dark:text-orange-300 font-semibold';
  if (rank <= 10) return 'text-green-600 dark:text-green-400 font-semibold';
  if (rank <= 100) return 'text-gray-600 dark:text-gray-300';
  return 'text-gray-400 dark:text-gray-500';
}

function medal(i: number) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return null;
}

export default function TopStickersClient({
  initial,
  topN,
}: {
  initial: GlobalStickerRanking;
  topN: number;
}) {
  // The page is ISR-cached (up to ~30 min behind the hourly scrape). Refresh pulls the live
  // standings on demand; it ONLY fires on an explicit click, so reads (~1500 index-seek rows via
  // /api/top-stickers) are spent per-click, never in the background. Everything the response
  // carries is re-rendered together — the snapshot line, the travel chips and the table all come
  // from the same query, so refreshing only the table would leave the other two contradicting it.
  const [data, setData] = useState<GlobalStickerRanking>(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return; // guard against double / spam clicks so one intent = one read
    setRefreshing(true);
    try {
      const res = await fetch('/api/top-stickers');
      const json = await res.json();
      // An empty packs list means the route hit its DB-failure fallback; keeping the current data
      // beats blanking a working page.
      if (json.data?.packs?.length) setData(json.data);
    } catch {
      // keep the current data on any failure
    } finally {
      setRefreshing(false);
    }
  }

  const CC = data.countries;

  return (
    <>
      {/* Part of the client tree, not the server shell above it: a refresh can change the pack
          count, and a stale line under fresh numbers is worse than no line. */}
      {data.asOf && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Snapshot {data.asOf} · top {topN} of {data.totalPacks.toLocaleString()} packs charting
          somewhere · refreshes hourly
        </p>
      )}

      {/* Lifted from the insights page: it answers the question this leaderboard raises. Once you
          see that the top packs are the ones charting in several markets, the natural next question
          is which KIND of pack manages that. */}
      {data.characterTravel.length > 0 && (
        <section className="mt-4 rounded-2xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Which characters travel
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            How often a character crosses borders. Most packs chart in only one country — this is the
            share of each character&apos;s packs that chart in two or three instead. A high number
            means the idea travels; a low one means it tends to stay a local hit. Characters with
            fewer than 15 packs are left out, because with only a handful a single crossover swings
            the percentage wildly.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {data.characterTravel.map((t) => (
              <span
                key={t.key}
                title={`${t.packs} ${t.label.replace(/^\S+\s/, '').toLowerCase()} packs charting, ${Math.round((t.multiPct / 100) * t.packs)} of them in more than one country`}
                className="text-xs px-2 py-1 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              >
                {t.label} <b className="text-gray-800 dark:text-gray-100 tabular-nums">{t.multiPct}%</b>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            Hover a chip for how many packs it is based on. Full market breakdown on the{' '}
            <a href="/insights" className="text-green-600 dark:text-green-400 hover:underline">
              insights page
            </a>
            .
          </p>
        </section>
      )}

      <div className="flex items-center justify-between gap-2 mt-5 mb-3">
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Fetch the latest rankings now"
          className="text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {refreshing ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 w-12">#</th>
              <th className="text-left px-2 py-2.5">Sticker</th>
              {CC.map((cc) => (
                <th key={cc} className="px-3 py-2.5 text-center whitespace-nowrap">
                  {COUNTRY_MAP[cc]?.flag} {cc.toUpperCase()}
                </th>
              ))}
              <th
                className="px-3 py-2.5 text-center hidden sm:table-cell"
                title="How many of the three markets it charts in"
              >
                In
              </th>
            </tr>
          </thead>
          <tbody>
            {data.packs.length === 0 && (
              <tr>
                <td
                  colSpan={CC.length + 3}
                  className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm"
                >
                  No data yet
                </td>
              </tr>
            )}
            {data.packs.map((p, i) => (
              <tr
                key={p.id}
                className="border-t border-gray-50 dark:border-gray-800 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
              >
                <td className="px-4 py-3 text-center font-bold text-gray-400 dark:text-gray-500">
                  {medal(i) ?? i + 1}
                </td>
                <td className="px-2 py-3">
                  <a href={`/sticker/${p.id}`} className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                      <Image
                        src={
                          p.image_url ??
                          `https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`
                        }
                        alt={p.name}
                        width={36}
                        height={36}
                        className="object-contain w-full h-full"
                      />
                    </div>
                    <div className="min-w-0">
                      {/* Same TypeBadge the rank tables use, so a pack reads identically here and
                          on its own page. Static packs render nothing — only the notable formats
                          (animated / popup / sound / effect) get a pill. */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-gray-700 dark:text-gray-200 truncate group-hover:text-green-700 dark:group-hover:text-green-300">
                          {p.name}
                        </span>
                        <TypeBadge type={p.sticker_type} />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {p.author ?? 'Unknown creator'}
                      </p>
                    </div>
                  </a>
                </td>
                {CC.map((cc) => {
                  const r = p.ranks[cc];
                  return (
                    <td key={cc} className="px-3 py-3 text-center">
                      {r == null ? (
                        <span
                          className="text-gray-300 dark:text-gray-600"
                          title={`Not in ${COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()}'s top ${UNRANKED_RANK} — counted as ${UNRANKED_RANK} in the average`}
                        >
                          —
                        </span>
                      ) : (
                        <span className={`tabular-nums ${rankClass(r)}`}>#{r}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center hidden sm:table-cell">
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {p.markets}/{CC.length}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
