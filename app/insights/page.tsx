import { getDb } from '@/lib/db';
import { getMarketInsights, type CountryInsight, type OverallInsight, type Share } from '@/lib/insights';
import { COUNTRY_MAP } from '@/lib/countries';
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
          <SectionTitle help="For each character with at least 15 packs charting, the share of those packs that appear in 2 or more markets. The 15-pack floor stops a character with 2 packs showing a meaningless 50%.">Characters that travel</SectionTitle>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
            Share charting in 2+ markets
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
                blurb="The chart is what has accumulated. These are the packs that entered in the last 7 days — what is working right now. Edge = share among new entrants minus share of the whole chart."
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
                blurb="Share of the top 50 vs share of the whole top 500. A positive edge means the character doesn't just appear often — it reaches the top. Share alone can't tell you that."
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
                blurb="Median chart position at each price point. If the cheapest tier doesn't rank better, price isn't what's holding a pack back."
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
                blurb="Median rank of numbered instalments (vol. 2, V.3) against everything else. Tests whether extending a proven character actually beats launching something new."
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
