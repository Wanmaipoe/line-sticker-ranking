'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { COUNTRY_MAP } from '@/lib/countries';
import TypeBadge from '@/components/TypeBadge';
import type { CountryChampions, ChampionDay } from '@/lib/champions';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days rendered before the "show the rest" fold. All 60 stay in the SSR HTML (so crawlers and
// no-JS visitors get everything); the folded ones are display:none, which means they never
// intersect the viewport and next/image never fetches their thumbnails. Showing three markets per
// day would otherwise make this page ~17,000px tall on a phone.
const INITIAL_DAYS = 14;

// Formatted from the parts by hand rather than via toLocaleDateString: the server and the visitor
// can sit in different locales, and a date that renders "25 Aug" on one and "Aug 25" on the other
// is a hydration mismatch. Parsed as UTC because the string is already a market-local calendar day
// (see lib/champions.ts) — letting it parse as local time would shift it a day west of GMT.
function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: DAY_NAMES[dt.getUTCDay()],
    dayMonth: `${d} ${MONTH_NAMES[m - 1]}`,
    month: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

function thumb(p: { id: string; image_url: string | null }) {
  return p.image_url ?? `https://stickershop.line-scdn.net/stickershop/v1/product/${p.id}/LINEStorePC/main.png`;
}

/** A date where two or more markets crowned the same pack — rare, and notable because of it. */
interface Agreement {
  codes: string[];
  all: boolean;
  name: string;
}

interface ShownMarket {
  country: string;
  byDate: Map<string, ChampionDay>;
}

export default function DailyChampionsClient({ initial }: { initial: CountryChampions[] }) {
  // The page is ISR-cached, so it can sit up to ~30 min behind the hourly scrape. Refresh pulls the
  // live history on demand; it fires ONLY on an explicit click, so the reads are spent per-click and
  // never in the background.
  const [data, setData] = useState<CountryChampions[]>(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return; // one intent = one query, even if the button is spammed
    setRefreshing(true);
    try {
      const res = await fetch('/api/daily-champions');
      const json = await res.json();
      // An empty payload means the route hit its DB-failure fallback; keeping the data already on
      // screen beats blanking a working page.
      if (Array.isArray(json.data) && json.data.some((c: CountryChampions) => c.days.length > 0)) {
        setData(json.data);
      }
    } catch {
      // keep the current data on any failure
    } finally {
      setRefreshing(false);
    }
  }

  // The pivot from "per country, a list of days" to "per day, a row per country" is purely
  // presentational, so it lives here rather than widening lib/champions.ts (the DB-facing module).
  // The component still server-renders, so everything below lands in the HTML for crawlers.

  // Union of every market's local calendar days, newest first. Each market's window starts on a
  // different local date, so the union is a day or two longer than any single market's list —
  // deliberately NOT trimmed, because trimming would silently drop a real day from one market.
  // ISO strings sort lexicographically, so this is exact rather than an approximation.
  const dates = useMemo(() => {
    const s = new Set<string>();
    for (const c of data) for (const d of c.days) s.add(d.date);
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [data]);

  // Markets with any data at all, keyed for O(1) cell lookup. `data` arrives in COUNTRY_ORDER
  // (jp, th, tw), so this is a stable vertical rail down the whole page.
  const shown = useMemo<ShownMarket[]>(
    () =>
      data
        .filter((c) => c.days.length > 0)
        .map((c) => ({ country: c.country, byDate: new Map(c.days.map((d) => [d.date, d])) })),
    [data]
  );

  // A market with nothing at all gets one notice, not 60 empty rows.
  const missing = useMemo(() => data.filter((c) => c.days.length === 0).map((c) => c.country), [data]);

  const agreement = useMemo(() => {
    const m = new Map<string, Agreement>();
    for (const date of dates) {
      const tally = new Map<string, { codes: string[]; name: string }>();
      for (const c of shown) {
        const w = c.byDate.get(date)?.winner;
        if (!w) continue;
        const t = tally.get(w.id);
        if (t) t.codes.push(c.country);
        else tally.set(w.id, { codes: [c.country], name: w.name });
      }
      let best: { codes: string[]; name: string } | null = null;
      for (const t of tally.values()) if (!best || t.codes.length > best.codes.length) best = t;
      if (best && best.codes.length >= 2) {
        m.set(date, { codes: best.codes, all: best.codes.length === shown.length && shown.length >= 3, name: best.name });
      }
    }
    return m;
  }, [dates, shown]);

  const pairs = agreement.size;
  const sweeps = [...agreement.values()].filter((a) => a.all).length;

  // Month headers are decided against the FULL date list, so the fold at INITIAL_DAYS cannot
  // desync them into a duplicated or missing "AUG 2026".
  const groups = dates.map((date, i) => ({
    date,
    showMonth: i === 0 || formatDay(dates[i - 1]).month !== formatDay(date).month,
    agreement: agreement.get(date) ?? null,
  }));

  if (dates.length === 0) {
    return (
      <>
        <Header refreshing={refreshing} onRefresh={refresh} />
        <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">
          No ranking history available yet.
        </p>
      </>
    );
  }

  return (
    <>
      <Header refreshing={refreshing} onRefresh={refresh} />

      {/* One card per market — all three at once, which is the whole point of dropping the tabs. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mt-5">
        {data.map((c) => {
          const meta = COUNTRY_MAP[c.country];
          return (
            <Stat
              key={c.country}
              label={
                <>
                  {meta?.flag}{' '}
                  <span className="hidden sm:inline">{meta?.name ?? c.country.toUpperCase()}</span>
                  <span className="sm:hidden">{c.country.toUpperCase()}</span>
                </>
              }
              value={String(c.distinctWinners)}
              unit="winners"
              sub={
                <>
                  <span className="block truncate">
                    {c.days.length}d · best {c.longestStreak?.days ?? 0}d
                  </span>
                  {/* The pack behind "best Nd" — the single most interesting name on the card, and
                      until now it existed only in the card's title tooltip, which does nothing on
                      touch. Linked, so it is one tap to that pack's full history. */}
                  {c.longestStreak && (
                    <a
                      href={`/sticker/${c.longestStreak.id}`}
                      title={`${c.longestStreak.name} — held #1 for ${c.longestStreak.days} days running in ${
                        meta?.name ?? c.country.toUpperCase()
                      }`}
                      className="block truncate text-green-600 dark:text-green-400 hover:underline"
                    >
                      {c.longestStreak.name}
                    </a>
                  )}
                </>
              }
              hint={
                c.longestStreak
                  ? `${c.distinctWinners} distinct packs won a day in ${
                      meta?.name ?? c.country.toUpperCase()
                    }; the longest reign was ${c.longestStreak.days} days by ${c.longestStreak.name}`
                  : `No days recorded for ${meta?.name ?? c.country.toUpperCase()} in this window`
              }
            />
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        {pairs === 0
          ? 'In this window no two markets ever crowned the same pack on the same day — Japan, Thailand and Taiwan run on completely separate tastes.'
          : sweeps === 0
            ? `Across these ${dates.length} days, two markets crowned the same pack on ${
                pairs === 1 ? 'just 1 day' : `only ${pairs} days`
              }, and all three never did — these markets run on largely separate tastes.`
            : `Across these ${dates.length} days, two markets crowned the same pack on ${pairs} ${
                pairs === 1 ? 'day' : 'days'
              }, and all three agreed on ${sweeps}.`}
      </p>

      {missing.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
          No snapshots at all for{' '}
          {missing.map((cc) => COUNTRY_MAP[cc]?.name ?? cc.toUpperCase()).join(' and ')} in this
          window, so it has no rows below.
        </p>
      )}

      <div className="mt-5 space-y-2">
        {groups.slice(0, INITIAL_DAYS).map((g) => (
          <DayGroup key={g.date} {...g} shown={shown} />
        ))}

        {/* A NAMED group (group/fold) below, not a bare one. `group-hover:` compiles to a
            descendant selector, so a bare `group` on this <details> — an ancestor of every folded
            row link, which uses `group` for its own hover — would turn all of their pack names
            green the moment the pointer touched the fold button. */}
        {groups.length > INITIAL_DAYS && (
          <details className="group/fold">
            <summary className="block list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none w-full rounded-xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 py-3 text-center text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors">
              <span className="group-open/fold:hidden">
                Show the other {groups.length - INITIAL_DAYS} days ▾
              </span>
              <span className="hidden group-open/fold:inline">Hide older days ▴</span>
            </summary>
            <div className="space-y-2 mt-2">
              {groups.slice(INITIAL_DAYS).map((g) => (
                <DayGroup key={g.date} {...g} shown={shown} />
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}

// Title and Refresh on one row, so the button lands at the top right of the page rather than
// floating above the list. Lives here rather than in page.tsx because it drives the client state.
function Header({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <div className="mt-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">👑 Daily #1</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Which sticker actually owned the top spot each day. Because the chart is read every hour,
          the #1 slot often changes hands during a single day — so the crown goes to the pack that{' '}
          <b className="font-semibold text-gray-600 dark:text-gray-300">held it for the most hours</b>,
          and the packs it beat are listed underneath.
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Fetch the latest daily winners now"
        className="flex-shrink-0 text-xs bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors disabled:opacity-50"
      >
        {refreshing ? 'Loading…' : '↻ Refresh'}
      </button>
    </div>
  );
}

function DayGroup({
  date,
  showMonth,
  agreement,
  shown,
}: {
  date: string;
  showMonth: boolean;
  agreement: Agreement | null;
  shown: ShownMarket[];
}) {
  const f = formatDay(date);

  // The <section> is deliberately NOT aria-labelled. A named section maps to role="region", i.e. a
  // landmark, so labelling all 61 of them filled the screen-reader landmark list with near-identical
  // "Wed 26 Aug" entries and nothing else — this page has no other landmark to find. The weekday and
  // date are visible text inside it and are announced on entry anyway. The id stays: it drives
  // scroll-mt-4 and the #d-YYYY-MM-DD anchors, and creates no landmark.
  return (
    <section
      id={`d-${date}`}
      // No content-visibility here, deliberately. `content-visibility: auto` also turns on PAINT
      // containment, which clips descendants to this box — and the day card (below lg) and each
      // market panel (from lg) carry a shadow and a 1px ring that sit right on the edge, so they
      // were being shaved off. Its other half, contain-intrinsic-size, was guessing 300px against
      // a real ~135px section, which misreports the scroll height across 61 of them. The <details>
      // fold already keeps the initial render to 14 days, which is where the real win was.
      className="scroll-mt-4"
    >
      {/* A real heading, not a <p>: it gives the document three stops (Aug/Jul/Jun) under the h1
          across an expanded page ~19,000px tall, matching how every other page here nests h2. */}
      {showMonth && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 pt-3 pb-1.5">
          {f.month}
        </h2>
      )}

      {/* Every card style is max-lg: on purpose. Below lg this is one card holding three stacked
          rows, so it needs the background, border and overflow-hidden (which keeps the row dividers
          and the gutter border inside the rounded corners). From lg the markets become separate
          panels and THIS element goes fully transparent, so the gaps between the columns show the
          page background rather than a strip of card. Never give this overflow-x-auto — nothing
          inside is allowed to be wider than the card. */}
      <div className="rounded-xl md:flex max-lg:border max-lg:border-gray-100 max-lg:dark:border-gray-800 max-lg:dark:ring-1 max-lg:dark:ring-white/10 max-lg:bg-white max-lg:dark:bg-gray-900 max-lg:shadow-sm max-lg:overflow-hidden">
        {/* Date: a header bar across the card on phones, a fixed left gutter from md up. The flip
            waits until md because at sm it would cost the name column ~109px, while at md the
            gutter is free. */}
        <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-2 border-b border-gray-50 dark:border-gray-800 md:w-24 md:flex-shrink-0 md:flex-col md:items-center md:justify-center md:gap-0 md:py-3 md:border-b-0 md:border-r md:border-gray-50 md:dark:border-gray-800 lg:border-r-0">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{f.weekday}</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 leading-tight tabular-nums">
            {f.dayMonth}
          </p>
          {agreement && (
            <span
              title={`${agreement.name} held #1 longest in ${agreement.codes
                .map((c) => COUNTRY_MAP[c]?.name ?? c.toUpperCase())
                .join(' and ')} on this day`}
              // md:ml-0 is required: margin-left:auto beats align-items:center once the gutter
              // becomes a column.
              className={`ml-auto md:ml-0 md:mt-1.5 flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                agreement.all
                  ? 'bg-[#06c755] text-white border border-[#06c755]'
                  : 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30'
              }`}
            >
              {agreement.codes.map((c) => COUNTRY_MAP[c]?.flag).join('')} same #1
            </span>
          )}
        </div>

        {/* The markets: stacked rows on phones and tablets, three side-by-side columns from lg up
            (JP | TH | TW, left to right — `shown` keeps getDailyChampions' COUNTRY_ORDER). The
            column step waits until lg because at md a third of the row is only ~218px, which
            leaves nothing for the pack name. Grid rows stretch, so the three cells of a day always
            share a baseline height.
            md:min-w-0 is load-bearing: without it this flex child refuses to shrink and one long
            pack name pushes the whole card wide. */}
        <div className="divide-y divide-gray-50 dark:divide-gray-800 md:flex-1 md:min-w-0 lg:grid lg:grid-cols-3 lg:gap-x-4 lg:divide-y-0">
          {shown.map((m) => (
            <MarketRow key={m.country} code={m.country} day={m.byDate.get(date)} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Returns ONE wrapper element, never a fragment: the parent's divide-y borders every child after
// the first, so a fragment of [row, contenders] would draw a divider between a market's own row
// and its own "also #1" line.
// Once the markets sit side by side they are separated by a real gap rather than a hairline rule —
// three dense columns butted together were hard to tell apart. The rounded corners give the hover
// highlight a panel shape that matches that gap; below lg the cells are full-width rows again and
// none of this applies.
const CELL_LG =
  'lg:rounded-xl lg:bg-white lg:dark:bg-gray-900 lg:shadow-sm lg:ring-1 lg:ring-gray-100 lg:dark:ring-white/10';

function MarketRow({ code, day }: { code: string; day: ChampionDay | undefined }) {
  const meta = COUNTRY_MAP[code];

  // The flag ALONE, deliberately — not flag + country code. Windows has no glyph for regional
  // indicator pairs and falls back to rendering the two letters, so "🇯🇵" and "JP" printed together
  // came out as "JP" stacked on "JP". Flag-only degrades to exactly the country code on Windows and
  // shows the flag everywhere else, so both platforms get one unambiguous label. The colour applies
  // to the Windows letters and is ignored by a real emoji glyph.
  const rail = (
    <div className={`w-9 flex-shrink-0 text-center${day ? '' : ' opacity-40'}`} title={meta?.name}>
      <p
        className="text-base font-semibold leading-tight text-gray-500 dark:text-gray-400"
        aria-hidden
      >
        {meta?.flag ?? code.toUpperCase()}
      </p>
      {/* The rail is the only thing naming the market on this row, and it is an emoji, so the
          accessible name has to come from here. */}
      <span className="sr-only">{meta?.name ?? code.toUpperCase()}</span>
    </div>
  );

  // Always rendered, never skipped — the flag rail is only a readable column if every date has
  // every market in the same order.
  if (!day) {
    return (
      <div className={CELL_LG}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          {rail}
          <p
            className="text-xs text-gray-400 dark:text-gray-500"
            title="No hourly snapshot recorded — either this market's day hasn't finished on its own clock yet, or a scrape was missed"
          >
            No snapshot recorded
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors ${CELL_LG}`}>
      {/* lg:flex-wrap is what re-flows the cell for column mode: the hours block below takes
          lg:w-full, so it drops onto its own line and the pack name gets the whole first line
          instead of competing with it inside a ~300px column. */}
      <div className="flex items-center gap-3 px-3 py-2.5 lg:flex-wrap lg:gap-y-1.5">
        {rail}

        <a
          href={`/sticker/${day.winner.id}`}
          title={`${day.winner.name} — ${day.winner.author ?? 'Unknown creator'}`}
          className="flex items-center gap-2.5 min-w-0 flex-1 group"
        >
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 ring-2 ring-yellow-300/70 dark:ring-yellow-400/40">
              <Image
                src={thumb(day.winner)}
                alt={day.winner.name}
                width={44}
                height={44}
                className="object-contain w-full h-full"
              />
            </div>
            <span className="absolute -top-1.5 -left-1.5 text-sm" aria-hidden>
              👑
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {/* flex-wrap, because the name is the one fact this page exists to deliver. The
                TypeBadge and the reign pill are both flex-shrink-0, so on a 139px phone line they
                took ~130px between them and the truncating name was left with 10.7px — narrower
                than a single ellipsis glyph, i.e. no name at all on the rows that carry both
                badges. Wrapping lets the name keep the full first line and pushes the badges
                underneath; the row height is still set by the 44px thumbnail, so nothing grows. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
              <span className="font-medium text-gray-800 dark:text-gray-100 truncate group-hover:text-green-700 dark:group-hover:text-green-300">
                {day.winner.name}
              </span>
              <TypeBadge type={day.winner.sticker_type} />
              {day.streak >= 2 && (
                <span
                  title={`Has held #1 for ${day.streak} days in a row up to this day`}
                  className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30 tabular-nums"
                >
                  {day.streak}d reign
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {day.winner.author ?? 'Unknown creator'}
            </p>
          </div>
        </a>

        {/* Right-hand cell while the markets are stacked; a full-width strip under the pack once
            they become columns, where the bar can stretch instead of being squeezed into 64px. */}
        <div className="flex-shrink-0 w-16 sm:w-24 text-right lg:w-full lg:text-left lg:flex lg:items-center lg:gap-2">
          <p
            className="text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums lg:flex-shrink-0"
            title={`Held #1 in ${day.winner.hours} of the ${day.hoursCovered} hourly snapshots taken that day`}
          >
            {day.winner.hours}
            <span className="text-gray-400 dark:text-gray-500 font-normal">/{day.hoursCovered}h</span>
          </p>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden lg:mt-0 lg:flex-1">
            <div
              className="h-full rounded-full bg-yellow-400 dark:bg-yellow-500"
              style={{ width: `${(day.winner.hours / Math.max(day.hoursCovered, 1)) * 100}%` }}
            />
          </div>
          {day.hoursCovered < 24 && (
            <p
              className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 lg:mt-0 lg:flex-shrink-0"
              title="Fewer than 24 hourly snapshots exist for this day, so the day is partial"
            >
              partial
            </p>
          )}
        </div>
      </div>

      {/* An inline text run rather than thumbnail chips: at three markets per day the chips cost
          about twice the height and triple the image count, and every pack still links out. The
          indent matches the row's gutter exactly — px-3 (12) + w-9 rail (36) + gap-3 (12) = 60px. */}
      {day.contenders.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-3 pb-2.5 pl-[3.75rem] text-[11px] text-gray-400 dark:text-gray-500">
          <span className="flex-shrink-0">also #1:</span>
          {day.contenders.map((c, i) => (
            <span key={c.id} className="inline-flex items-baseline gap-1 min-w-0">
              {i > 0 && (
                <span aria-hidden className="text-gray-300 dark:text-gray-600">
                  ·
                </span>
              )}
              <a
                href={`/sticker/${c.id}`}
                title={`${c.name} — held #1 for ${c.hours}h`}
                className="max-w-[7.5rem] sm:max-w-[10rem] truncate text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-300 hover:underline"
              >
                {c.name}
              </a>
              <span className="tabular-nums flex-shrink-0">{c.hours}h</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  sub,
}: {
  label: ReactNode;
  value: string;
  unit?: string;
  hint?: string;
  sub?: ReactNode;
}) {
  return (
    <div
      title={hint}
      className="rounded-xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 bg-white dark:bg-gray-900 px-3.5 py-2.5"
    >
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-tight">
        {value}
        {/* A real space, not just the margin: without it the value and unit concatenate into
            "35winners" for screen readers and anything reading the text content. */}
        {unit && <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">{' '}{unit}</span>}
      </p>
      {/* A div, not a truncating <p>: `sub` now carries two block lines (the figures and a link to
          the best-streak pack), and the old white-space:nowrap would have collapsed them onto one. */}
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}
