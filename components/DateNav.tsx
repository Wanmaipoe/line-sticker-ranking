'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Date helpers
//
// Every one of these is UTC-only and formats from these two arrays by hand, the same way
// app/daily-champions/DailyChampionsClient.tsx does. A snapshot_date is a bare calendar day, not an
// instant: parsing it with `new Date('2026-08-01')` and reading it back with the LOCAL getters
// hands a visitor west of GMT the 31st, and toLocaleDateString would render "Aug 1" on the server
// and "1 Aug" in the browser. Either one is a hydration mismatch on a component that server-renders.
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Mon-first, matching how the rest of the world outside the US reads a calendar.
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `m0` is 0-based, as in Date.UTC. */
const isoOf = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;

/** "2026-09-05" -> "5 Sep 2026". */
function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function daysInMonth(y: number, m0: number) {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Mon-first column (0 = Mon … 6 = Sun) that the 1st of the month sits in. */
function firstColumn(y: number, m0: number) {
  return (new Date(Date.UTC(y, m0, 1)).getUTCDay() + 6) % 7;
}

/** Strict YYYY-MM-DD that is also a real calendar day — the same check /api/top-stickers runs. */
function isRealDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// YYYY-MM-DD sorts lexicographically, so every range check below is a plain string compare.

export interface DateRange {
  first: string;
  last: string;
}

// ---------------------------------------------------------------------------
// The calendar popover
//
// Hand-rolled rather than pulled from npm: this needs one month grid with a disabled range, which
// is ~80 lines, against a dependency that would ship its own date library and locale data to every
// visitor of a page whose whole job is a table.
// ---------------------------------------------------------------------------

function CalendarPopover({
  value,
  range,
  onPick,
}: {
  value: string | null;
  range: DateRange;
  onPick: (d: string | null) => void;
}) {
  // Anchored on the selection, else on the newest day that has data — never on `new Date()`, so the
  // month shown is a pure function of the props.
  const [view, setView] = useState(() => {
    const anchor = value && value >= range.first && value <= range.last ? value : range.last;
    const [y, m] = anchor.split('-').map(Number);
    return { y, m0: m - 1 };
  });

  // Bangkok's calendar day, the clock the site presents to visitors — only for the "today" ring. Which
  // days are selectable comes from `range` (UTC snapshot days). Safe to read the wall clock here
  // because this component only ever mounts from a click, so it never renders on the server and
  // cannot mismatch on hydration.
  // eslint-disable-next-line react-hooks/purity
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const prev = view.m0 === 0 ? { y: view.y - 1, m0: 11 } : { y: view.y, m0: view.m0 - 1 };
  const next = view.m0 === 11 ? { y: view.y + 1, m0: 0 } : { y: view.y, m0: view.m0 + 1 };
  // A neighbouring month is reachable only if any of its days fall inside the range.
  const canPrev = isoOf(prev.y, prev.m0, daysInMonth(prev.y, prev.m0)) >= range.first;
  const canNext = isoOf(next.y, next.m0, 1) <= range.last;

  const lead = firstColumn(view.y, view.m0);
  const total = daysInMonth(view.y, view.m0);

  const arrowClass =
    'w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 ' +
    'hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent ' +
    'dark:disabled:hover:bg-transparent transition-colors';

  return (
    <div
      role="dialog"
      aria-label="Choose a day"
      // Right-aligned and width-capped: at 375px the page's own px-4 leaves 343px, and an
      // absolutely positioned box that overhangs the right edge is what widens the document.
      className="absolute right-0 top-full mt-2 z-20 w-[17rem] max-w-[calc(100vw-2.5rem)] rounded-xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900 shadow-lg p-3"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView(prev)}
          disabled={!canPrev}
          aria-label="Previous month"
          title="Previous month"
          className={arrowClass}
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
          {MONTH_NAMES[view.m0]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => setView(next)}
          disabled={!canNext}
          aria-label="Next month"
          title="Next month"
          className={arrowClass}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mt-2">
        {WEEKDAY_NAMES.map((w) => (
          <div key={w} className="text-[10px] text-center text-gray-400 dark:text-gray-500 py-1">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const d = isoOf(view.y, view.m0, i + 1);
          const outside = d < range.first || d > range.last;
          const selected = d === value;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              disabled={outside}
              onClick={() => onPick(d)}
              aria-label={formatDay(d)}
              aria-pressed={selected}
              title={outside ? 'No ranking recorded for this day' : formatDay(d)}
              className={[
                'h-8 rounded-lg text-xs tabular-nums transition-colors',
                outside
                  ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                  : selected
                    ? 'bg-[#06c755] text-white dark:text-white font-semibold'
                    : isToday
                      ? 'ring-1 ring-[#06c755] dark:ring-[#06c755] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-800">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {formatDay(range.first)} – {formatDay(range.last)}
        </span>
        <button
          type="button"
          onClick={() => onPick(null)}
          title="Go back to the live ranking"
          className="text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-2.5 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors flex-shrink-0"
        >
          Latest
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The whole "show me a past day" control: trigger button, open/close plumbing and the popover.
 *
 * It owns nothing about WHAT a day means — the page keeps the selected day, the fetch and the URL.
 * `onPick` fires after the popover has closed and focus is back on the trigger, so a caller only
 * has to decide what to load.
 */
export default function DateNav({
  value,
  range,
  onPick,
  busy = false,
  disabled = false,
  label = 'Today',
}: {
  /** The selected day as YYYY-MM-DD, or null for the live ranking. */
  value: string | null;
  range: DateRange;
  onPick: (d: string | null) => void;
  /** A day is being fetched: disables the trigger and shows "📅 Loading…". */
  busy?: boolean;
  /**
   * Disabled WITHOUT the loading label — for a page where a sibling control (the Refresh button on
   * /top-stickers) owns the in-flight state and should be the only thing saying "Loading…".
   */
  disabled?: boolean;
  /** The word shown when nothing is selected. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape and click-outside. pointerdown rather than click so a drag that starts outside also
  // dismisses; the opening click's own pointerdown has already fired by the time this attaches.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(d: string | null) {
    setOpen(false);
    triggerRef.current?.focus();
    onPick(d);
  }

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy || disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Show the ranking for a past day"
        className="text-xs bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 tabular-nums"
      >
        {busy ? '📅 Loading…' : `📅 ${value ? formatDay(value) : label}`}
      </button>
      {open && <CalendarPopover value={value} range={range} onPick={pick} />}
    </div>
  );
}

export { formatDay, isRealDate };
