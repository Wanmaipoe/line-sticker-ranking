'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP } from '@/lib/countries';
import TypeBadge from '@/components/TypeBadge';
import DateNav, { formatDay, isRealDate, type DateRange } from '@/components/DateNav';
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
  dateRange,
}: {
  initial: GlobalStickerRanking;
  topN: number;
  /** Bounds of the archive, or null when the DB was unreadable — then there is simply no picker. */
  dateRange: DateRange | null;
}) {
  // The page is ISR-cached (up to ~30 min behind the hourly scrape). Refresh pulls the live
  // standings on demand; it ONLY fires on an explicit click, so reads (~1500 index-seek rows via
  // /api/top-stickers) are spent per-click, never in the background. Everything the response
  // carries is re-rendered together — the snapshot line, the travel chips and the table all come
  // from the same query, so refreshing only the table would leave the other two contradicting it.
  const [data, setData] = useState<GlobalStickerRanking>(initial);

  // Two different dates, deliberately. `date` is what the visitor ASKED for — it drives the trigger
  // label, the URL and the highlighted cell. `shownDate` is the day the rows in `data` actually came
  // from, and only moves on a successful load. When a day turns out to hold no ranking we keep the
  // old table up, and the header line has to keep describing THAT table, not the failed request.
  const [date, setDate] = useState<string | null>(null);
  const [shownDate, setShownDate] = useState<string | null>(null);

  const [busy, setBusy] = useState<'refresh' | 'date' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Monotonic id of the newest request. A response whose id is stale belongs to a day the visitor
  // has already moved on from, and must not land on top of the newer one.
  const reqIdRef = useRef(0);
  const inFlightRef = useRef<{ active: boolean; target: string | null }>({ active: false, target: null });

  const load = useCallback(async (d: string | null, kind: 'refresh' | 'date') => {
    // One intent = one read: a spammed button asking for the day already being fetched is ignored.
    // A DIFFERENT day is a new intent, so it supersedes — the older request is abandoned below.
    if (inFlightRef.current.active && inFlightRef.current.target === d) return;
    const id = ++reqIdRef.current;
    inFlightRef.current = { active: true, target: d };
    setBusy(kind);
    setNotice(null);
    try {
      const res = await fetch(d ? `/api/top-stickers?date=${d}` : '/api/top-stickers');
      const json = await res.json();
      if (id !== reqIdRef.current) return; // abandoned — a newer day is already on its way
      // Empty packs means either the route's DB-failure fallback or a day with nothing recorded.
      // Either way keeping the current data beats blanking a working page.
      if (json.data?.packs?.length) {
        setData(json.data);
        setShownDate(d);
      } else {
        setNotice(
          d ? `No ranking recorded for ${formatDay(d)}` : 'Could not load the latest ranking'
        );
      }
    } catch {
      if (id !== reqIdRef.current) return;
      setNotice(d ? `Could not load ${formatDay(d)}` : 'Could not load the latest ranking');
    } finally {
      // Only the newest request owns the busy flag; an abandoned one must not clear it.
      if (id === reqIdRef.current) {
        inFlightRef.current = { active: false, target: null };
        setBusy(null);
      }
    }
  }, []);

  // history.replaceState, never router.push: pushing would re-run the server component and throw
  // away the ISR-cached render this page exists to serve. The date is a client-side concern.
  function syncUrl(d: string | null) {
    const path = window.location.pathname;
    window.history.replaceState(null, '', d ? `${path}?date=${d}` : path);
  }

  function pick(d: string | null) {
    if (d === date && d === shownDate && !notice) return; // already on screen — don't spend a read
    setDate(d);
    syncUrl(d);
    void load(d, 'date');
  }

  // Deep link restore. Guarded by a ref rather than the dep array alone because React's dev-mode
  // double-invoke would otherwise fire the fetch twice and pay for the day's rows twice.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (!dateRange) return;
    const raw = new URLSearchParams(window.location.search).get('date');
    if (!raw) return;
    if (isRealDate(raw) && raw >= dateRange.first && raw <= dateRange.last) {
      // Intentional client-only sync from an external system React does not own (the URL bar).
      // location.search cannot be read during SSR, so this cannot be initial state without a
      // hydration mismatch; it fires once per mount, so there is no cascade to worry about.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(raw);
      void load(raw, 'date');
    } else {
      // A junk ?date= left in the URL would contradict the live table underneath it.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [dateRange, load]);

  const CC = data.countries;
  // The newest archived day and the live ranking are the SAME snapshot, so selecting today must not
  // relabel the header "end of day" or disable Refresh — and today is the cell the calendar opens
  // on, so it is the likeliest first click in the whole control.
  const liveDay = dateRange?.last ?? initial.asOf;
  // Keyed to what is on SCREEN, not to what was asked for: a pick that failed or found nothing
  // leaves the live table up, and Refresh has to stay usable in that state.
  const isPast = shownDate !== null && shownDate !== liveDay;

  return (
    <>
      {/* Part of the client tree, not the server shell above it: a refresh can change the pack
          count, and a stale line under fresh numbers is worse than no line. */}
      {data.asOf && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Snapshot {data.asOf} · top {topN} of {data.totalPacks.toLocaleString()} packs charting
          somewhere · {isPast ? 'end of day' : 'refreshes hourly'}
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

      <div className="flex items-center justify-between gap-3 flex-wrap mt-5 mb-3">
        {/* The title sits on the wrapper, not the button: a disabled button swallows mouse events
            in Chrome, so its own title never renders a tooltip. */}
        <span
          className="flex-shrink-0"
          title={
            isPast
              ? 'Refresh only applies to the live ranking — a past day cannot change'
              : 'Fetch the latest rankings now'
          }
        >
          <button
            onClick={() => {
              // A pick that failed or found nothing left `date` set while the live table stayed on
              // screen; refreshing live means that selection is gone.
              if (date !== null) {
                setDate(null);
                syncUrl(null);
              }
              void load(null, 'refresh');
            }}
            disabled={busy !== null || isPast}
            className="text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {busy === 'refresh' ? 'Loading…' : '↻ Refresh'}
          </button>
        </span>

        {dateRange && (
          // `busy` vs `disabled`: a Refresh in flight locks the picker too, but Refresh is the
          // control that says "Loading…" — only a date fetch relabels the trigger.
          <DateNav
            value={date}
            range={dateRange}
            onPick={pick}
            busy={busy === 'date'}
            disabled={busy !== null}
          />
        )}
      </div>

      {notice && (
        <p className="text-xs text-amber-600 dark:text-amber-400 -mt-1 mb-3 text-right">
          {notice} · still showing {shownDate ? formatDay(shownDate) : 'the latest ranking'}
        </p>
      )}

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
