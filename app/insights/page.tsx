import { getDb } from '@/lib/db';
import {
  getMarketInsights,
  getDayPatterns,
  type CountryInsight,
  type OverallInsight,
  type Share,
  type DayPattern,
  type DayPatterns,
} from '@/lib/insights';
import { COUNTRY_MAP, FEATURED_COUNTRIES } from '@/lib/countries';
import JsonLd from '@/components/JsonLd';
import BackButton from '@/components/BackButton';
import { SITE_URL, SITE_NAME } from '@/lib/seo';
import type { Metadata } from 'next';

// Aggregate market stats move slowly, so an hour of staleness is invisible while cutting the
// per-render read cost by 24x versus force-dynamic.
export const revalidate = 3600;

const TITLE = 'LINE Sticker Market Insights — Formats, Characters, Prices & Churn';
const DESCRIPTION =
  'What actually charts on LINE in Japan, Thailand and Taiwan: format and character mix, dominant price points, weekly churn, creator concentration and who holds #1 — from live top-500 data.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/insights' },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/insights` },
};

const CARD =
  'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 p-5';
const H2 = 'text-base font-bold text-gray-800 dark:text-gray-100';
const SUB = 'text-xs text-gray-400 dark:text-gray-500 mt-0.5';

// Fixed hues per format/character so the same thing is the same colour in all three columns.
const BAR_COLORS = ['#06c755', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#a16207', '#64748b'];

/** `minRows` reserves height for a fixed number of rows so the same section lines up across all
 *  four columns even when a market has fewer entries (Taiwan charts no Custom packs, for example)
 *  — otherwise every section below it drifts out of alignment and the columns stop being
 *  comparable at a glance, which is the whole point of the layout. */
function Bars({ items, max = 6, minRows }: { items: Share[]; max?: number; minRows?: number }) {
  const top = items.slice(0, max);
  const reserve = minRows ? { minHeight: minRows * 16 + (minRows - 1) * 6 } : undefined;
  if (!top.length)
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500" style={reserve}>
        No data yet
      </p>
    );
  const peak = Math.max(...top.map((t) => t.pct), 1);
  return (
    <div className="space-y-1.5" style={reserve}>
      {top.map((t, i) => (
        <div key={t.key} className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 text-xs text-gray-600 dark:text-gray-300 truncate" title={t.label}>
            {t.label}
          </span>
          <span className="flex-1 h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <span
              className="block h-full rounded"
              style={{ width: `${(t.pct / peak) * 100}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
            />
          </span>
          <span className="w-10 flex-shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {t.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A section heading that explains its own maths on hover. Pure CSS (group-hover) rather than React
 * state, so this page stays fully server-rendered and ships no JavaScript for it. The popover goes
 * LIGHTER in dark mode — a dark tooltip on a dark card is invisible.
 */
function SectionTitle({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <h3 className="group relative inline-flex items-start gap-1 text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2 cursor-help">
      <span className="border-b border-dotted border-gray-300 dark:border-gray-600">{children}</span>
      <span aria-hidden className="text-gray-300 dark:text-gray-600 text-[10px] leading-4">
        ⓘ
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-60 rounded-lg p-2.5 text-[11px] font-normal leading-snug opacity-0 shadow-lg transition-opacity group-hover:opacity-100 bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900"
      >
        {help}
      </span>
    </h3>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    // Uniform height: some labels wrap to two lines ("held by top 10 creators") and some don't,
    // which otherwise makes one column's stat grid taller and knocks every section below it out of
    // line with the other three.
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5 min-h-[87px]">
      <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">{hint}</p>}
    </div>
  );
}

/** A signed percentage-point delta. Green when the thing is gaining, red when it's losing. */
function Edge({ v }: { v: number }) {
  const tone =
    v > 0.5
      ? 'text-green-600 dark:text-green-400'
      : v < -0.5
        ? 'text-red-500 dark:text-red-400'
        : 'text-gray-400 dark:text-gray-500';
  return (
    <span className={`w-12 flex-shrink-0 text-right tabular-nums font-semibold ${tone}`}>
      {v > 0 ? '+' : ''}
      {v}
    </span>
  );
}

/** One analysis, shown for every market side by side. Lives below the country columns so the
 *  4-across comparison row above stays intact. */
function AnalysisCard({
  title,
  blurb,
  countries,
  render,
}: {
  title: string;
  blurb: string;
  countries: CountryInsight[];
  render: (c: CountryInsight) => React.ReactNode;
}) {
  return (
    <section className={CARD}>
      <h2 className={H2}>{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">{blurb}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {countries.map((c) => (
          <div key={c.country}>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-1">
              <span>{COUNTRY_MAP[c.country]?.flag}</span>
              {COUNTRY_MAP[c.country]?.name ?? c.country.toUpperCase()}
            </p>
            {render(c)}
          </div>
        ))}
      </div>
    </section>
  );
}

function AllMarkets({ o }: { o: OverallInsight }) {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const reach1 = o.reach.find((r) => r.markets === 1);
  const reachAll = o.reach.find((r) => r.markets === o.reach.length);
  const REACH_COLORS = ['#cbd5e1', '#60a5fa', '#06c755'];

  return (
    <div className={`${CARD} space-y-5 ring-2 ring-green-100 dark:ring-green-500/20`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌏</span>
        <div>
          <h2 className={H2}>All markets</h2>
          <p className={SUB}>{o.distinctPacks} distinct packs</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat value={`${o.distinctCreators}`} label="distinct creators" hint="across all 3" />
        <Stat value={`${o.chartSlots}`} label="chart slots" hint={`${o.distinctPacks} unique`} />
        <Stat
          value={reach1 ? `${reach1.pct}%` : '—'}
          label="in one market only"
          hint={reach1 ? `${reach1.packs} packs` : undefined}
        />
        <Stat
          value={reachAll ? `${reachAll.packs}` : '—'}
          label={`packs in all ${o.reach.length}`}
          hint={reachAll ? `just ${reachAll.pct}%` : undefined}
        />
      </div>

      {/* Format mix / Character mix / Price points come FIRST and in the same order as the country
          columns, so the three comparable sections sit on the same rows across all four cards.
          Market reach is unique to this column, so it goes below them rather than shunting them
          down and breaking the alignment. */}
      <section>
        <SectionTitle help="Share of this column’s packs by sticker format. The format comes free from the type icon LINE shows on each pack in the ranking list — no icon means a plain static pack.">Format mix</SectionTitle>
        <Bars items={o.formats} max={4} minRows={4} />
        {/* Mirrors the per-country caption below the same chart, both to say something useful and
            to keep this column's following sections level with theirs. */}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Combined across all three markets — see each column for how a format indexes at the top.
        </p>
      </section>

      <section>
        <SectionTitle help="Share of packs by their main character. Labels come from a vision model reading each pack’s thumbnail once, and admins can correct any it gets wrong. Packs not yet labelled are left out of the percentages.">Character mix</SectionTitle>
        <Bars items={o.characters} max={6} minRows={6} />
      </section>

      <section>
        <SectionTitle help="The most common prices, as a share of packs whose price we know (shown underneath). Uses LINE’s canonical USD tier rather than local currency, so the three markets stay comparable.">Price points</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {o.prices.map((p, i) => (
            <span
              key={p.price}
              className={`text-xs px-2 py-1 rounded-lg border ${
                i === 0
                  ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300 font-medium'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {usd(p.price)} · {p.pct}%
            </span>
          ))}
        </div>
        {o.medianPrice != null && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">Median {usd(o.medianPrice)}</p>
        )}
      </section>

      <section>
        <SectionTitle help="Of every distinct pack charting anywhere, how many appear in exactly 1, 2 or 3 markets. A pack charting in both Japan and Thailand is counted once, with a reach of 2 — never twice.">Market reach</SectionTitle>
        <div className="space-y-1.5">
          {o.reach.map((r, i) => (
            <div key={r.markets} className="flex items-center gap-2">
              <span className="w-20 flex-shrink-0 text-xs text-gray-600 dark:text-gray-300">
                {r.markets} market{r.markets > 1 ? 's' : ''}
              </span>
              <span className="flex-1 h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <span
                  className="block h-full rounded"
                  style={{ width: `${r.pct}%`, backgroundColor: REACH_COLORS[i % REACH_COLORS.length] }}
                />
              </span>
              <span className="w-10 flex-shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {r.pct}%
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Almost every pack is a local hit — crossing markets is rare.
        </p>
      </section>

      {o.characterTravel.length > 0 && (
        <section>
          <SectionTitle help="How often a character crosses borders. Most packs chart in only one country — this is the share of that character’s packs that chart in two or three countries instead. A high number means the idea travels well; a low one means it tends to stay a local hit. Characters with fewer than 15 packs are left out, because with only a handful of packs a single crossover swings the percentage wildly.">Characters that travel</SectionTitle>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
            % of each character&apos;s packs charting in more than one country
          </p>
          <div className="flex flex-wrap gap-1.5">
            {o.characterTravel.slice(0, 5).map((t) => (
              <span
                key={t.key}
                title={`${t.packs} packs charting`}
                className="text-xs px-2 py-1 rounded-lg border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              >
                {t.label} <b className="text-gray-800 dark:text-gray-100 tabular-nums">{t.multiPct}%</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {o.travelers.length > 0 && (
        <section>
          <SectionTitle help="Packs currently sitting in the top 500 of every market at the same time, ordered by their best rank across those markets.">Charting in all {o.reach.length}</SectionTitle>
          <ol className="space-y-1">
            {o.travelers.slice(0, 5).map((t, i) => (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-4 flex-shrink-0 text-gray-300 dark:text-gray-600 tabular-nums">{i + 1}</span>
                <a
                  href={`/sticker/${t.id}`}
                  className="flex-1 truncate text-gray-700 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400"
                  title={t.name}
                >
                  {t.name}
                </a>
                <span className="text-gray-400 dark:text-gray-500 tabular-nums flex-shrink-0">
                  #{t.bestRank}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function CountryColumn({ c }: { c: CountryInsight }) {
  const info = COUNTRY_MAP[c.country];
  const delta = Math.round((c.animatedTop50Pct - c.animatedOverallPct) * 10) / 10;
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className={`${CARD} space-y-5`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{info?.flag}</span>
        <div>
          <h2 className={H2}>{info?.name ?? c.country.toUpperCase()}</h2>
          <p className={SUB}>{c.packs} packs charting</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat value={`${c.distinctCreators}`} label="distinct creators" hint="in the top 500" />
        <Stat
          value={c.newPerDay != null ? `${c.newPerDay}` : '—'}
          label="new entrants / day"
          hint={c.overlap24hPct != null ? `${c.overlap24hPct}% held over` : undefined}
        />
        <Stat
          value={c.overlap7dPct != null ? `${c.overlap7dPct}%` : '—'}
          label="still here after 7 days"
          hint={c.newPerWeek != null ? `${c.newPerWeek} replaced` : undefined}
        />
        <Stat
          value={`${c.top10CreatorSharePct}%`}
          label="held by top 10 creators"
          hint={c.top10CreatorSharePct >= 30 ? 'concentrated' : 'open field'}
        />
      </div>

      <section>
        <SectionTitle help="Share of this column’s packs by sticker format. The format comes free from the type icon LINE shows on each pack in the ranking list — no icon means a plain static pack.">Format mix</SectionTitle>
        <Bars items={c.formats} max={4} minRows={4} />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Animated is <b className="text-gray-600 dark:text-gray-300">{c.animatedTop50Pct}%</b> of the top 50 vs{' '}
          {c.animatedOverallPct}% overall
          {delta !== 0 && (
            <>
              {' — '}
              <span className={delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                {delta > 0 ? 'over' : 'under'}-indexes at the top
              </span>
            </>
          )}
        </p>
      </section>

      <section>
        <SectionTitle help="Share of packs by their main character. Labels come from a vision model reading each pack’s thumbnail once, and admins can correct any it gets wrong. Packs not yet labelled are left out of the percentages.">Character mix</SectionTitle>
        <Bars items={c.characters} max={6} minRows={6} />
      </section>

      <section>
        <SectionTitle help="The most common prices, as a share of packs whose price we know (shown underneath). Uses LINE’s canonical USD tier rather than local currency, so the three markets stay comparable.">Price points</SectionTitle>
        {c.prices.length ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {c.prices.map((p, i) => (
                <span
                  key={p.price}
                  className={`text-xs px-2 py-1 rounded-lg border ${
                    i === 0
                      ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300 font-medium'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {usd(p.price)} · {p.pct}%
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              Median {c.medianPrice != null ? usd(c.medianPrice) : '—'} · from {c.pricedPacks} priced packs
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">No price data yet</p>
        )}
      </section>

      <section>
        <SectionTitle help="How many of this market’s current top 500 packs belong to each creator. So nagano showing 15 means 15 of Japan’s 500 slots right now are nagano packs — it counts chart slots held today, not lifetime releases or sales. The name is the pack’s author on LINE Store.">Biggest creators</SectionTitle>
        <ol className="space-y-1">
          {c.topCreators.map((t, i) => (
            <li key={t.author} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-gray-300 dark:text-gray-600 tabular-nums">{i + 1}</span>
              <a
                href={`/creator/${encodeURIComponent(t.author)}`}
                className="flex-1 truncate text-gray-700 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400"
              >
                {t.author}
              </a>
              <span className="text-gray-400 dark:text-gray-500 tabular-nums">{t.packs}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle help="For each of the last 7 days we take the final snapshot captured that day and read whichever pack was sitting at rank 1. Days where the scraper missed a run are skipped.">#1 over the last 7 days</SectionTitle>
        {c.topSpot.length ? (
          <>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
              {c.distinctNo1 === 1
                ? 'One pack held the top spot all week'
                : `${c.distinctNo1} different packs held #1`}
            </p>
            <ul className="space-y-1">
              {[...c.topSpot].reverse().slice(0, 4).map((t) => (
                <li key={t.date} className="flex items-center gap-2 text-xs">
                  <span className="w-12 flex-shrink-0 text-gray-400 dark:text-gray-500 tabular-nums">
                    {t.date.slice(5)}
                  </span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-200" title={t.name}>
                    {t.name}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">No history yet</p>
        )}
      </section>

      <section>
        <SectionTitle help="Share of charting titles that look like a numbered instalment — the title contains vol, part, a V.2-style marker, or a standalone number from 2 to 19. It is a rough text match, so a title with a year in it can be caught.">Sequels</SectionTitle>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <b className="text-gray-800 dark:text-gray-100">{c.sequelPct}%</b> of charting titles look like a
          numbered instalment
        </p>
      </section>
    </div>
  );
}

const FEATURED_ORDER: readonly string[] = FEATURED_COUNTRIES;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Spelled out for the hover text, where "over 20 Tuesdays" has to read as English.
const WEEKDAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
// Columns run Monday to Sunday, like the calendar in components/DateNav.tsx. The data keeps
// SQLite's strftime('%w') numbering (0 = Sunday), so this is display order only — every lookup
// below still indexes by the real weekday number.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_PATTERN_COPY: Record<DayPattern['metric'], { title: string; rule: string; unit: string }> = {
  debut: {
    title: 'New packs reaching a top 500',
    rule: 'One pack in one market counts as one, so a pack entering both Japan and Thailand counts twice.',
    unit: 'packs per day',
  },
  peak: {
    title: 'Packs hitting their best-ever rank',
    rule: 'Counted the same way: one pack in one market counts as one.',
    unit: 'packs per day',
  },
};

interface GridRow {
  key: string;
  label: string;
  perDay: number[];
  events: number[];
}

/** All markets first, then each market in the page's usual order. */
function gridRows(p: DayPattern): GridRow[] {
  const rows: GridRow[] = [
    {
      key: 'all',
      label: 'All markets',
      perDay: p.weekdays.map((w) => w.perDay),
      events: p.weekdays.map((w) => w.events),
    },
  ];
  for (const country of FEATURED_ORDER) {
    const m = p.byCountry.find((x) => x.country === country);
    if (!m) continue;
    const info = COUNTRY_MAP[country];
    rows.push({
      key: country,
      label: `${info?.flag ?? ''} ${info?.name ?? country.toUpperCase()}`,
      perDay: m.perDay,
      events: m.events,
    });
  }
  return rows;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString());

/** How far below the busiest day the quietest one sits, as a percentage. */
function swingPct(perDay: number[]): number {
  const hi = Math.max(...perDay);
  const lo = Math.min(...perDay);
  return hi > 0 ? Math.round((1 - lo / hi) * 100) : 0;
}

/**
 * One metric as a single grid: weekday across the top, one row per scope. Each cell prints the real
 * per-day average and is shaded against ITS OWN row's average day, which is what makes rows with
 * wildly different magnitudes (169 packs vs 2.1 changes) sit in one table honestly — shade carries
 * the rhythm, the printed number keeps the absolute value.
 *
 * Replaced twelve separate bar panels: with weekday on the vertical axis and a private scale per
 * panel, comparing Wednesday across markets meant scanning a 2,400px card and holding numbers in
 * your head. Here a weekday is one column, so a weekly rhythm reads as a vertical band.
 */
function WeekGrid({ pattern }: { pattern: DayPattern }) {
  const rows = gridRows(pattern);
  const copy = DAY_PATTERN_COPY[pattern.metric];
  // Stars mark the three busiest weekdays of the ALL MARKETS row — one ranking for the whole grid,
  // so the market rows below can be read against the same three days rather than each having its own.
  const overall = rows[0]?.perDay ?? [];
  const top3 = overall
    .map((value, weekday) => ({ value, weekday }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((x) => x.weekday);
  const dayCounts = pattern.weekdays.map((w) => w.days); // per weekday — never one scalar for all seven
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-[5.5rem] text-left font-normal text-[11px] text-gray-400 dark:text-gray-500 pl-0.5">
              {copy.unit}
            </th>
            {WEEK_ORDER.map((d) => {
              const rank = top3.indexOf(d);
              return (
                <th
                  key={d}
                  className={`font-medium text-[11px] pb-0.5 ${
                    rank >= 0 ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                  }`}
                  title={rank >= 0 ? `#${rank + 1} busiest day across all markets` : undefined}
                >
                  {WEEKDAY_LABELS[d]}
                  {rank >= 0 && (
                    // Three stars for the busiest day, two for second, one for third — so the
                    // ranking is readable without hovering, and without colour doing the work.
                    <span className="text-[#06c755] ml-0.5 tracking-tighter" aria-label={`number ${rank + 1} busiest`}>
                      {'★'.repeat(3 - rank)}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const avg = mean(row.perDay);
            const best = row.perDay.indexOf(Math.max(...row.perDay));
            return (
              <tr key={row.key}>
                <th className="text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap pr-1.5">
                  {row.label}
                </th>
                {WEEK_ORDER.map((w) => {
                  const value = row.perDay[w];
                  // Shade by distance from this row's own average day: 0.7x or below is the palest
                  // step, 1.3x or above the darkest. One hue, so it reads as "more" not "different".
                  const ratio = avg > 0 ? value / avg : 1;
                  const alpha = Math.min(0.55, Math.max(0.05, ((ratio - 0.7) / 0.6) * 0.5 + 0.05));
                  const vsAvg = avg > 0 ? Math.round((ratio - 1) * 100) : 0;
                  return (
                    <td
                      key={w}
                      style={{ backgroundColor: `rgba(6, 199, 85, ${alpha.toFixed(3)})` }}
                      className={`text-center tabular-nums rounded px-1 py-1.5 ${
                        w === best
                          ? 'font-bold text-gray-900 dark:text-white ring-1 ring-[#06c755]'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}
                      title={`${WEEKDAY_LABELS[w]}: ${fmt(value)} ${copy.unit} · ${row.events[w].toLocaleString()} over ${dayCounts[w]} ${WEEKDAY_PLURAL[w]} · ${vsAvg >= 0 ? '+' : ''}${vsAvg}% vs this row's average day`}
                    >
                      {fmt(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Wednesday is busiest (169 a day) and Sunday quietest (93, 45% fewer)" — derived, never written
 *  by hand, so it cannot drift from the data. */
function findingSentence(p: DayPattern): string {
  const copy = DAY_PATTERN_COPY[p.metric];
  const perDay = p.weekdays.map((w) => w.perDay);
  const hi = perDay.indexOf(Math.max(...perDay));
  const lo = perDay.indexOf(Math.min(...perDay));
  return `${WEEKDAY_LABELS[hi]} is busiest at ${fmt(perDay[hi])} ${copy.unit}, ${WEEKDAY_LABELS[lo]} quietest at ${fmt(perDay[lo])} (${swingPct(perDay)}% fewer).`;
}

/** Markets whose own busiest weekday differs from the all-markets one — the Japan-peaks-Friday
 *  finding, found rather than asserted. */
function exceptionSentence(p: DayPattern): string | null {
  const overall = p.weekdays.map((w) => w.perDay).indexOf(Math.max(...p.weekdays.map((w) => w.perDay)));
  const odd = p.byCountry
    .filter((c) => c.perDay.indexOf(Math.max(...c.perDay)) !== overall)
    .map((c) => ({ name: COUNTRY_MAP[c.country]?.name ?? c.country.toUpperCase(), day: WEEKDAY_LABELS[c.perDay.indexOf(Math.max(...c.perDay))] }));
  if (!odd.length) return `All ${p.byCountry.length} markets peak on ${WEEKDAY_LABELS[overall]}.`;
  const named = odd.map((o) => `${o.name} peaks on ${o.day}`).join(', ');
  // "the rest" only if a market is actually left over. The all-markets row is a SUM, so its
  // busiest day can be nobody's own busiest day — then every market lands in `odd` and the clause
  // would be describing an empty set.
  return odd.length < p.byCountry.length ? `${named} — the rest on ${WEEKDAY_LABELS[overall]}.` : `${named}.`;
}

function MetricBlock({ pattern, open }: { pattern: DayPattern; open: boolean }) {
  const copy = DAY_PATTERN_COPY[pattern.metric];
  const body = (
    <>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{copy.rule}</p>
      <div className="mt-2">
        <WeekGrid pattern={pattern} />
      </div>
    </>
  );
  if (open) {
    return (
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{copy.title}</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
          {findingSentence(pattern)} {exceptionSentence(pattern)}
        </p>
        {body}
      </div>
    );
  }
  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="text-gray-400 dark:text-gray-500 group-open:rotate-90 transition-transform">▸</span>
        <span className="font-semibold text-gray-700 dark:text-gray-200">{copy.title}</span>
        <span className="w-full sm:w-auto pl-5 sm:pl-0 text-xs text-gray-500 dark:text-gray-400">
          {findingSentence(pattern)}
        </span>
      </summary>
      <div className="pl-5">
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{exceptionSentence(pattern)}</p>
        {body}
      </div>
    </details>
  );
}

const DAY_METRIC_ORDER: DayPattern['metric'][] = ['debut', 'peak'];

function WeekdayCard({ data }: { data: DayPatterns }) {
  const patterns = DAY_METRIC_ORDER.map((m) => data.patterns.find((p) => p.metric === m)).filter(
    (p): p is DayPattern => !!p
  );
  if (!patterns.length) return null;
  return (
    <section className={`${CARD} mt-6`}>
      <h2 className={H2}>Which day of the week</h2>
      <p className={SUB}>
        {data.from} to {data.to}, rebuilt once a day. Every figure is an average per day, never a
        total — the window holds a different number of each weekday as it grows. Packs already
        charting when tracking began are left out; they would all look like they arrived on day one.
        Shading compares a day with its own row&apos;s average day; hover a cell for the raw count.
        ★★★ marks the busiest day across all markets, ★★ the second, ★ the third.
      </p>
      {patterns.map((p, i) => (
        <MetricBlock key={p.metric} pattern={p} open={i === 0} />
      ))}
    </section>
  );
}

export default async function InsightsPage() {
  let data: Awaited<ReturnType<typeof getMarketInsights>> = {
    asOf: null,
    countries: [],
    overall: {
      distinctPacks: 0, chartSlots: 0, distinctCreators: 0, reach: [],
      formats: [], characters: [], prices: [], medianPrice: null,
      travelers: [], characterTravel: [],
    },
  };
  let dayPatterns: DayPatterns | null = null;
  try {
    dayPatterns = await getDayPatterns(getDb());
  } catch {
    // Same graceful fallback as the main query: the section just doesn't render.
  }
  try {
    data = await getMarketInsights(getDb());
  } catch {
    // Read quota / DB outage: render the page shell rather than a 500.
  }

  const jsonLd = data.countries.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'LINE sticker market insights — Japan, Thailand, Taiwan',
        description: DESCRIPTION,
        url: `${SITE_URL}/insights`,
        creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        temporalCoverage: data.asOf ?? undefined,
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {jsonLd && <JsonLd data={jsonLd} />}
      {/* Wider than the rest of the site: this page's job is a 4-across comparison (all markets +
          the three countries), and at max-w-7xl each column lands under 300px. */}
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <a href="/" className="text-sm text-green-600 dark:text-green-400 hover:underline">
            Main
          </a>
        </div>

        <header className="mt-5 mb-6">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">📊 Market Insights</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
            What actually charts in each market — format and character mix, price points, how fast the chart
            turns over, and how concentrated the competition is. Everything here is computed from the live
            top-500 we already track, so it reflects what is selling right now rather than what a survey says.
          </p>
          {data.asOf && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Snapshot {data.asOf} · refreshes automatically every hour, from the same hourly scrape
              that powers the rankings
            </p>
          )}
        </header>

        {data.countries.length === 0 ? (
          <div className={CARD}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Insights are temporarily unavailable. They will return with the next data refresh.
            </p>
          </div>
        ) : (
          <>
            {/* All four columns in one row: the whole point is comparing markets side by side, and
                the combined view is just another column rather than a banner above them. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
              <AllMarkets o={data.overall} />
              {data.countries.map((c) => (
                <CountryColumn key={c.country} c={c} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
              <AnalysisCard
                title="📈 What's rising"
                blurb="Which characters are gaining ground right now. The chart itself took months to build up, so it mostly reflects what was already popular — this looks only at packs that broke into the top 500 in the last 7 days. First number is the character's share of the whole chart, second is its share of just this week's arrivals: 4% → 6% means it is arriving faster than it currently holds. The line above each list is how many packs entered, and how many of those were animated."
                countries={data.countries}
                render={(c) =>
                  c.entrants ? (
                    <>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
                        {c.entrants.count} new this week · {c.entrants.animatedPct}% animated
                      </p>
                      <ul className="space-y-1">
                        {c.entrants.characters.slice(0, 3).map((x) => (
                          <li key={x.key} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{x.label}</span>
                            <span className="tabular-nums text-gray-400 dark:text-gray-500">
                              {x.chartPct}% → {x.newPct}%
                            </span>
                            <Edge v={x.edge} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Not enough new entrants yet</p>
                  )
                }
              />

              <AnalysisCard
                title="🏔️ Which characters actually climb"
                blurb="Common is not the same as successful. Some characters fill the chart but sit in its lower half; others are rarer and cluster near the very top. First number is the character's share of the whole top 500, second is its share of just the top 50: 7% → 12% means it is punching above its weight where it counts. The mix bars above tell you what is everywhere, this tells you what actually wins."
                countries={data.countries}
                render={(c) => (
                  <ul className="space-y-1">
                    {c.characterEdge.slice(0, 3).map((x) => (
                      <li key={x.key} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{x.label}</span>
                        <span className="tabular-nums text-gray-400 dark:text-gray-500">
                          {x.chartPct}% → {x.top50Pct}%
                        </span>
                        <Edge v={x.edge} />
                      </li>
                    ))}
                  </ul>
                )}
              />

              <AnalysisCard
                title="💰 Price vs rank"
                blurb="Whether being cheap actually helps a pack rank. For each price tier we take every charting pack sold at that price and read off the middle one's position — half rank better, half rank worse. Shorter bar and lower number are better; the faint figure on the right is how many packs sit in that tier. If the cheapest tier is not clearly ahead, price is not what is holding a pack back."
                countries={data.countries}
                render={(c) => (
                  <ul className="space-y-1">
                    {c.priceVsRank.map((p) => (
                      <li key={p.price} className="flex items-center gap-2 text-xs">
                        <span className="w-14 flex-shrink-0 text-gray-700 dark:text-gray-200 tabular-nums">
                          ${(p.price / 100).toFixed(2)}
                        </span>
                        <span className="flex-1 h-1.5 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          {/* Shorter bar = better median rank, so the eye reads left as "wins". */}
                          <span
                            className="block h-full rounded bg-green-500"
                            style={{ width: `${Math.min(100, (p.medianRank / 500) * 100)}%` }}
                          />
                        </span>
                        <span className="w-16 flex-shrink-0 text-right tabular-nums text-gray-500 dark:text-gray-400">
                          #{p.medianRank}
                        </span>
                        <span className="w-8 flex-shrink-0 text-right tabular-nums text-gray-300 dark:text-gray-600">
                          {p.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              />

              <AnalysisCard
                title="🔢 Do sequels pay?"
                blurb="Whether extending a pack that worked beats launching something new. Titles that read as a numbered instalment (Vol. 2, V.3, Part 4) are compared against everything else, using the middle rank of each group — lower is better. Sequels only exist because the original sold, so they start with a built-in advantage: if they still do not rank better, the familiar name is not carrying them."
                countries={data.countries}
                render={(c) => {
                  const s = c.sequels;
                  const better =
                    s.sequelMedian != null && s.originalMedian != null ? s.sequelMedian < s.originalMedian : null;
                  return (
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-gray-700 dark:text-gray-200">Sequels</span>
                        <span className="tabular-nums text-gray-400 dark:text-gray-500">{s.sequelCount} packs</span>
                        <span className="w-12 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                          #{s.sequelMedian ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-gray-700 dark:text-gray-200">Originals</span>
                        <span className="tabular-nums text-gray-400 dark:text-gray-500">{s.originalCount} packs</span>
                        <span className="w-12 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                          #{s.originalMedian ?? '—'}
                        </span>
                      </div>
                      {better !== null && (
                        <p className={`text-[11px] ${better ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {better
                            ? `Sequels rank ${Math.abs((s.originalMedian ?? 0) - (s.sequelMedian ?? 0))} places better`
                            : `No sequel advantage here`}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
            </div>

            {dayPatterns && <WeekdayCard data={dayPatterns} />}

            <section className={`${CARD} mt-6`}>
              <h2 className={H2}>How to read this</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-gray-600 dark:text-gray-300 list-disc pl-4">
                <li>
                  <b>Over/under-indexing</b> compares a format&apos;s share of the top 50 with its share of the
                  whole top 500. Over-indexing means the format is disproportionately common at the very top,
                  which is a stronger signal than raw share.
                </li>
                <li>
                  <b>New entrants and turnover</b> come from comparing today&apos;s chart with the snapshots from
                  24 hours and 7 days ago. A market that turns over faster has more openings — and less staying
                  power once you are in.
                </li>
                <li>
                  <b>Top-10 creator share</b> is how much of the chart the ten biggest creators occupy. Higher
                  means a few studios dominate; lower means the field is open.
                </li>
                <li>
                  <b>Sequels</b> counts charting titles that read as a numbered instalment (vol. 2, V.3, Part 4).
                  A high number means proven characters get extended rather than replaced.
                </li>
                <li>
                  <b>All markets combined</b> counts each pack once, however many countries it charts in — so
                  it is smaller than the three columns added together, and &quot;market reach&quot; shows how
                  many packs are local hits versus genuine cross-border ones.
                </li>
                <li>
                  Character labels come from an image model and are corrected by hand where wrong, so treat the
                  smaller slices as indicative. Prices are the canonical USD tier, not local currency.
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
