'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/hooks/useFavorites';
import TypeBadge from '@/components/TypeBadge';
import BackButton from '@/components/BackButton';
import DateNav, { formatDay, isRealDate, type DateRange } from '@/components/DateNav';

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
  /** Bounds of this market's archive, or null when the DB was unreadable — then there is no picker. */
  dateRange: DateRange | null;
}

export default function CountryClient({
  code,
  name,
  flag,
  date: initialDate,
  items: initialItems,
  dateRange,
}: Props) {
  const router = useRouter();
  const { isFavorite, toggle } = useFavorites();

  // The page itself is ISR-cached and server-renders the live top 50. Everything below only ever
  // moves on an explicit click, so a visitor who never touches the calendar costs zero extra reads.
  const [items, setItems] = useState<RankItem[]>(initialItems);
  // The day the rows on screen actually came from, as the API reported it — this is what the
  // "As of" line has to describe.
  const [asOf, setAsOf] = useState<string | null>(initialDate);

  // Two different dates, deliberately, exactly as on /top-stickers. `date` is what the visitor
  // ASKED for — it drives the trigger label, the URL and the highlighted cell. `shownDate` is the
  // day `items` came from and only moves on a successful load, so when a day turns out to hold no
  // ranking the old list stays up and the header keeps describing THAT list.
  const [date, setDate] = useState<string | null>(null);
  const [shownDate, setShownDate] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Monotonic id of the newest request. A response whose id is stale belongs to a day the visitor
  // has already moved on from, and must not land on top of the newer one.
  const reqIdRef = useRef(0);
  const inFlightRef = useRef<{ active: boolean; target: string | null }>({ active: false, target: null });

  const load = useCallback(
    async (d: string | null) => {
      // One intent = one read: a spammed pick asking for the day already being fetched is ignored.
      // A DIFFERENT day is a new intent, so it supersedes — the older request is abandoned below.
      if (inFlightRef.current.active && inFlightRef.current.target === d) return;
      const id = ++reqIdRef.current;
      inFlightRef.current = { active: true, target: d };
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`/api/country/${code}/top?limit=50${d ? `&date=${d}` : ''}`);
        const json = await res.json();
        if (id !== reqIdRef.current) return; // abandoned — a newer day is already on its way
        // No items means either a day with nothing recorded or a failed query. Either way keeping
        // the current list beats blanking a working page.
        if (Array.isArray(json.items) && json.items.length) {
          setItems(json.items as RankItem[]);
          setAsOf((json.date as string | null) ?? d);
          setShownDate(d);
        } else {
          setNotice(d ? `No ranking recorded for ${formatDay(d)}` : 'Could not load the latest ranking');
        }
      } catch {
        if (id !== reqIdRef.current) return;
        setNotice(d ? `Could not load ${formatDay(d)}` : 'Could not load the latest ranking');
      } finally {
        // Only the newest request owns the busy flag; an abandoned one must not clear it.
        if (id === reqIdRef.current) {
          inFlightRef.current = { active: false, target: null };
          setBusy(false);
        }
      }
    },
    [code]
  );

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
    void load(d);
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
      void load(raw);
    } else {
      // A junk ?date= left in the URL would contradict the live list underneath it.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [dateRange, load]);

  // The newest archived day and the live snapshot are the SAME rows, so picking today must not
  // relabel the header "end of day". Keyed to what is on SCREEN, not to what was asked for.
  const liveDay = dateRange?.last ?? initialDate;
  const isPast = shownDate !== null && shownDate !== liveDay;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">Main</a>
        </div>

        {/* flex-wrap so the picker drops onto its own line at 375px instead of squeezing the
            title; ml-auto keeps it right-aligned on that second line, where justify-between
            alone would leave a lone item at the start. */}
        <div className="mt-5 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-4xl">{flag}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{name} — Top 50</h1>
              {asOf && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                  {isPast ? `As of ${formatDay(asOf)} · end of day` : `As of ${asOf}`}
                </p>
              )}
            </div>
          </div>
          {dateRange && (
            <div className="ml-auto flex-shrink-0">
              <DateNav value={date} range={dateRange} onPick={pick} busy={busy} />
            </div>
          )}
        </div>

        {notice && (
          <p className="text-xs text-amber-600 dark:text-amber-400 -mt-3 mb-4 text-right">
            {notice} · still showing {shownDate ? formatDay(shownDate) : 'the latest ranking'}
          </p>
        )}

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
