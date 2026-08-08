import { COUNTRY_MAP } from '@/lib/countries';
import type { CreatorAnalysis, CreatorBenchmark } from '@/lib/creator-analysis';

/**
 * The "Creator analysis" card under the chart. Presentational only — everything is precomputed
 * server-side (lib/creator-analysis.ts), so rendering this costs no reads and no client JS beyond
 * what CreatorClient already ships.
 *
 * Tooltips are native `title` attributes rather than the insights page's CSS popovers: this card
 * lives inside a sticky, internally-scrollable column, and an absolutely-positioned popover would
 * clip against that scroll container. Native titles never clip.
 */

function Label({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <h3
      title={help}
      className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5 cursor-help inline-block border-b border-dotted border-gray-300 dark:border-gray-600"
    >
      {children}
    </h3>
  );
}

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-2.5 py-2 min-w-0">
      <p className="text-base font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-tight truncate">
        {value}
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{label}</p>
      {hint && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 truncate">{hint}</p>
      )}
    </div>
  );
}

/* ── Paired-comparison grid ─────────────────────────────────────────────────
   The new-this-month / veterans sections render as label | creator | top-creator columns.
   Desktop gets true side-by-side columns; on mobile (card ~340px) the benchmark cell drops to
   its own row, indented under the creator's value with the author's name inlined, because three
   columns at ~100px each would wrap every pack name into porridge. */

const PAIR_GRID_3 =
  'grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs items-baseline';
const PAIR_GRID_2 = 'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs items-baseline';

function PairHeader({ you, top }: { you: string; top: string }) {
  return (
    <>
      <span className="hidden sm:block" />
      <span
        className="hidden sm:block text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate"
        title={you}
      >
        {you}
      </span>
      <span
        className="hidden sm:block text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate"
        title={top}
      >
        {top}
      </span>
    </>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-400 dark:text-gray-500">{children}</span>;
}

function YouCell({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 text-gray-700 dark:text-gray-200">{children}</span>;
}

function TopCell({ author, children }: { author: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0 col-start-2 sm:col-start-auto text-gray-400 dark:text-gray-500">
      {/* Mobile only: name the owner, since the cell sits under the creator's value there. */}
      <span className="sm:hidden uppercase tracking-wide text-[10px] mr-1">{author}:</span>
      {children}
    </span>
  );
}

type Verdict = 'ahead' | 'competitive' | 'behind';

/** Bigger is better (pack counts). Equal counts as competitive, not ahead. */
function countVerdict(you: number, top: number): Verdict {
  if (you > top) return 'ahead';
  if (top === 0 || you >= top * 0.6) return 'competitive';
  return 'behind';
}

/** Lower is better (ranks). Within 50 places on a 500-deep chart reads as the same league. */
function rankVerdict(you: number | null, top: number | null): Verdict {
  if (you == null) return top == null ? 'competitive' : 'behind';
  if (top == null || you < top) return 'ahead';
  return you <= top + 50 ? 'competitive' : 'behind';
}

const VERDICT_STYLE: Record<Verdict, string> = {
  ahead: 'text-green-600 dark:text-green-400',
  competitive: 'text-gray-500 dark:text-gray-400',
  behind: 'text-red-500 dark:text-red-400',
};

function VerdictChip({ v }: { v: Verdict }) {
  return <span className={`w-20 flex-shrink-0 text-right font-semibold ${VERDICT_STYLE[v]}`}>{v}</span>;
}

/** Best (lowest) current rank across all markets, from the footprint. */
function bestRankOf(a: CreatorAnalysis): number | null {
  const ranks = a.markets.map((m) => m.best?.rank).filter((r): r is number => r != null);
  return ranks.length ? Math.min(...ranks) : null;
}

function animatedPctOf(a: CreatorAnalysis): number {
  return a.formats.find((f) => f.key === 'animated')?.pct ?? 0;
}


export default function CreatorAnalysisCard({
  a,
  author,
  benchmark,
}: {
  a: CreatorAnalysis;
  author: string;
  benchmark: CreatorBenchmark | null;
}) {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const maxCharting = Math.max(1, ...a.markets.map((m) => m.charting));
  const flag = (cc: string) => COUNTRY_MAP[cc]?.flag ?? cc.toUpperCase();
  const np = a.newPacks;
  const vt = a.veterans;
  // The top creator's equivalents, shown as the grey right-hand column of each section.
  const np2 = benchmark?.analysis.newPacks ?? null;
  const vt2 = benchmark?.analysis.veterans ?? null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 dark:ring-1 dark:ring-white/10 p-4 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Creator analysis</h2>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          value={`${a.chartingNow}/${a.totalPacks}`}
          label="packs charting now"
          hint={a.chartingNow === 0 ? 'none ranked today' : undefined}
        />
        <Tile
          value={a.peak ? `#${a.peak.rank}` : '—'}
          label="peak this week"
          hint={a.peak ? `${flag(a.peak.country)} ${a.peak.name}` : 'no chart data'}
        />
        <Tile
          value={String(a.multiMarket)}
          label="in 2+ markets"
          hint={a.multiMarket === 0 ? 'all local hits' : 'crossing borders'}
        />
      </div>

      <section>
        <Label help="Where this creator actually competes: how many of their packs sit in each market's top 500 right now, and their single best rank there. Bars are relative to their strongest market.">
          Market footprint
        </Label>
        <div className="space-y-1.5">
          {/* Column headers, aligned to the two numeric columns below. */}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <span className="w-20 flex-shrink-0" />
            <span className="flex-1" />
            <span className="w-12 flex-shrink-0 text-right" title="How many of their packs are in this market's top 500 right now">
              Packs
            </span>
            <span className="w-14 flex-shrink-0 text-right" title="Their best current rank in that market">
              Best rank
            </span>
          </div>
          {a.markets.map((m) => (
            <div key={m.country} className="flex items-center gap-2 text-xs">
              <span className="w-20 flex-shrink-0 text-gray-600 dark:text-gray-300">
                {flag(m.country)} {COUNTRY_MAP[m.country]?.name ?? m.country.toUpperCase()}
              </span>
              <span className="flex-1 h-1.5 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <span
                  className="block h-full rounded bg-green-500"
                  style={{ width: `${(m.charting / maxCharting) * 100}%` }}
                />
              </span>
              <span className="w-12 flex-shrink-0 text-right tabular-nums text-gray-700 dark:text-gray-200 font-semibold">
                {m.charting}
              </span>
              <span
                className="w-14 flex-shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500 truncate"
                title={m.best ? `Best right now: ${m.best.name}` : 'Nothing charting here'}
              >
                {m.best ? `#${m.best.rank}` : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {benchmark && (
        <section>
          <Label help={`How this creator stacks up against ${benchmark.author}, currently the biggest creator on the site's Top Creators board (most top-100 chart slots across the three markets). Both sides are measured the same way, over the live top 500. "Competitive" means within striking distance — counts at 60%+ of theirs, or a best rank within 50 places.`}>
            vs top creator
          </Label>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
            {benchmark.youAreTop ? (
              <>This IS the top creator — compared with #2, </>
            ) : (
              <>Benchmark: #1 creator </>
            )}
            <a
              href={`/creator/${encodeURIComponent(benchmark.author)}`}
              className="text-green-600 dark:text-green-400 hover:underline"
            >
              {benchmark.author}
            </a>
          </p>
          <div className="space-y-1">
            {/* Column headers: the creators' actual names, truncated with the full name on hover. */}
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <span className="flex-1" />
              <span className="w-12 flex-shrink-0 text-right truncate" title={author}>
                {author}
              </span>
              <span className="w-12 flex-shrink-0 text-right truncate" title={benchmark.author}>
                {benchmark.author}
              </span>
              <span className="w-20 flex-shrink-0" />
            </div>
            {(
              [
                {
                  label: 'Packs on chart',
                  help: 'Distinct packs holding a rank in at least one market right now',
                  you: String(a.chartingNow),
                  top: String(benchmark.analysis.chartingNow),
                  v: countVerdict(a.chartingNow, benchmark.analysis.chartingNow),
                },
                {
                  label: 'Best rank',
                  help: 'Best current position in any market',
                  you: bestRankOf(a) != null ? `#${bestRankOf(a)}` : '—',
                  top: bestRankOf(benchmark.analysis) != null ? `#${bestRankOf(benchmark.analysis)}` : '—',
                  v: rankVerdict(bestRankOf(a), bestRankOf(benchmark.analysis)),
                },
                {
                  label: 'In 2+ markets',
                  help: 'Packs charting in more than one market — the cross-border signal',
                  you: String(a.multiMarket),
                  top: String(benchmark.analysis.multiMarket),
                  v: countVerdict(a.multiMarket, benchmark.analysis.multiMarket),
                },
              ] as { label: string; help: string; you: string; top: string; v: Verdict }[]
            ).map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <span
                  className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400 cursor-help"
                  title={r.help}
                >
                  {r.label}
                </span>
                <span className="w-12 flex-shrink-0 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                  {r.you}
                </span>
                <span className="w-12 flex-shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500">
                  {r.top}
                </span>
                <VerdictChip v={r.v} />
              </div>
            ))}
            {/* Style rows — informative, no verdict: more animated or a higher price is a choice,
                not a score. */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400 cursor-help"
                title="Share of each catalogue that is animated — a style difference worth knowing, not a score"
              >
                Animated share
              </span>
              <span className="w-12 flex-shrink-0 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                {animatedPctOf(a)}%
              </span>
              <span className="w-12 flex-shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500">
                {animatedPctOf(benchmark.analysis)}%
              </span>
              <span className="w-20 flex-shrink-0" />
            </div>
            {a.medianPrice != null && benchmark.analysis.medianPrice != null && (
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400 cursor-help"
                  title="Median canonical USD price of each catalogue — pricing strategy, not a score"
                >
                  Median price
                </span>
                <span className="w-12 flex-shrink-0 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                  {usd(a.medianPrice)}
                </span>
                <span className="w-12 flex-shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500">
                  {usd(benchmark.analysis.medianPrice)}
                </span>
                <span className="w-20 flex-shrink-0" />
              </div>
            )}
          </div>
        </section>
      )}

      {np && (
        <section>
          <Label help="Packs whose first-ever chart appearance (in any of the three markets) is within the last 30 days. Debut rank is the position a pack held in its very first snapshot; the climb compares that with where it sits today, in the same market it entered through. The right-hand column is the same measure for the top creator; on narrow screens it drops to a grey line under each value.">
            New this month
          </Label>
          <div className={np2 && benchmark ? PAIR_GRID_3 : PAIR_GRID_2}>
            {np2 && benchmark && <PairHeader you={author} top={benchmark.author} />}

            <RowLabel>Entered chart</RowLabel>
            <YouCell>
              {np.count === 0 ? (
                <span className="text-gray-400 dark:text-gray-500">
                  none in the last {np.windowDays} days
                </span>
              ) : (
                <>
                  {/* Each count carries its pack names in the hover, dotted-underlined so the
                      affordance is visible — same convention as the "N tied" tooltip. */}
                  <span
                    className="cursor-help border-b border-dotted border-gray-300 dark:border-gray-600"
                    title={[...np.stillNames, ...np.exitedPacks.map((e) => e.name)].join('\n')}
                  >
                    <b className="tabular-nums">{np.count}</b> pack{np.count !== 1 ? 's' : ''}
                  </span>
                  {' · '}
                  <span
                    className="cursor-help border-b border-dotted border-gray-300 dark:border-gray-600"
                    title={np.stillNames.length ? np.stillNames.join('\n') : 'None still charting'}
                  >
                    {np.stillCharting} in
                  </span>
                  {np.exited > 0 && (
                    <>
                      {' · '}
                      <span
                        className="cursor-help border-b border-dotted border-gray-300 dark:border-gray-600"
                        title={`Fell back out of every top 500:\n${np.exitedPacks.map((e) => `${e.name} (${e.days}d)`).join('\n')}`}
                      >
                        {np.exited} out
                        {np.avgLifespanDays != null && (
                          <span className="text-gray-400 dark:text-gray-500"> (~{np.avgLifespanDays}d)</span>
                        )}
                      </span>
                    </>
                  )}
                </>
              )}
            </YouCell>
            {np2 && benchmark && (
              <TopCell author={benchmark.author}>
                {np2.count === 0 ? (
                  'none this month'
                ) : (
                  <>
                    <span
                      className="cursor-help border-b border-dotted border-gray-200 dark:border-gray-700"
                      title={[...np2.stillNames, ...np2.exitedPacks.map((e) => e.name)].join('\n')}
                    >
                      <b className="tabular-nums">{np2.count}</b> pack{np2.count !== 1 ? 's' : ''}
                    </span>
                    {' · '}
                    <span
                      className="cursor-help border-b border-dotted border-gray-200 dark:border-gray-700"
                      title={np2.stillNames.length ? np2.stillNames.join('\n') : 'None still charting'}
                    >
                      {np2.stillCharting} in
                    </span>
                    {np2.exited > 0 && (
                      <>
                        {' · '}
                        <span
                          className="cursor-help border-b border-dotted border-gray-200 dark:border-gray-700"
                          title={`Fell back out of every top 500:\n${np2.exitedPacks.map((e) => `${e.name} (${e.days}d)`).join('\n')}`}
                        >
                          {np2.exited} out{np2.avgLifespanDays != null && ` (~${np2.avgLifespanDays}d)`}
                        </span>
                      </>
                    )}
                  </>
                )}
              </TopCell>
            )}

            {np.bestDebut && (
              <>
                <RowLabel>Hottest debut</RowLabel>
                <YouCell>
                  <a
                    href={`/sticker/${np.bestDebut.id}`}
                    className="hover:text-green-600 dark:hover:text-green-400"
                  >
                    {np.bestDebut.name}
                  </a>{' '}
                  <span
                    className="text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap"
                    title={`Entered the ${COUNTRY_MAP[np.bestDebut.country]?.name ?? np.bestDebut.country.toUpperCase()} chart at #${np.bestDebut.rank}`}
                  >
                    {flag(np.bestDebut.country)} #{np.bestDebut.rank}
                  </span>
                </YouCell>
                {np2 && benchmark && (
                  <TopCell author={benchmark.author}>
                    {np2.bestDebut ? (
                      <>
                        <a
                          href={`/sticker/${np2.bestDebut.id}`}
                          className="hover:text-green-600 dark:hover:text-green-400"
                        >
                          {np2.bestDebut.name}
                        </a>{' '}
                        <span
                          className="tabular-nums whitespace-nowrap"
                          title={`Entered the ${COUNTRY_MAP[np2.bestDebut.country]?.name ?? np2.bestDebut.country.toUpperCase()} chart at #${np2.bestDebut.rank}`}
                        >
                          {flag(np2.bestDebut.country)} #{np2.bestDebut.rank}
                        </span>
                      </>
                    ) : (
                      'no new pack this month'
                    )}
                  </TopCell>
                )}
              </>
            )}

            {np.bestClimb && (
              <>
                <RowLabel>Best climb</RowLabel>
                <YouCell>
                  <a
                    href={`/sticker/${np.bestClimb.id}`}
                    className="hover:text-green-600 dark:hover:text-green-400"
                  >
                    {np.bestClimb.name}
                  </a>{' '}
                  <span className="text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {flag(np.bestClimb.country)} #{np.bestClimb.from}→#{np.bestClimb.to}
                  </span>{' '}
                  <b className="text-green-600 dark:text-green-400 tabular-nums">+{np.bestClimb.delta}</b>
                </YouCell>
                {np2 && benchmark && (
                  <TopCell author={benchmark.author}>
                    {np2.bestClimb ? (
                      <>
                        <a
                          href={`/sticker/${np2.bestClimb.id}`}
                          className="hover:text-green-600 dark:hover:text-green-400"
                        >
                          {np2.bestClimb.name}
                        </a>{' '}
                        <span className="tabular-nums whitespace-nowrap">
                          {flag(np2.bestClimb.country)} #{np2.bestClimb.from}→#{np2.bestClimb.to} +{np2.bestClimb.delta}
                        </span>
                      </>
                    ) : (
                      'no new pack climbing'
                    )}
                  </TopCell>
                )}
              </>
            )}

            {np.entryMarket && (
              <>
                <RowLabel>Enters via</RowLabel>
                <YouCell>
                  {flag(np.entryMarket.country)}{' '}
                  {COUNTRY_MAP[np.entryMarket.country]?.name ?? np.entryMarket.country.toUpperCase()}{' '}
                  <span className="text-gray-400 dark:text-gray-500">
                    ({np.entryMarket.count} of {np.count})
                  </span>
                </YouCell>
                {np2 && benchmark && (
                  <TopCell author={benchmark.author}>
                    {np2.entryMarket ? (
                      <>
                        {flag(np2.entryMarket.country)}{' '}
                        {COUNTRY_MAP[np2.entryMarket.country]?.name ??
                          np2.entryMarket.country.toUpperCase()}{' '}
                        ({np2.entryMarket.count} of {np2.count})
                      </>
                    ) : (
                      'no clear favourite market'
                    )}
                  </TopCell>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {vt && (
        <section>
          <Label help="Packs first seen on a chart more than 30 days ago and still holding a rank somewhere today. 'Longest run' counts days since a pack's first appearance; a ≥ means it was already charting when our data begins, so the real run is longer — and when several packs tie there, hover to see them all. The traits line is what the long-stayers have in common — a pattern, not a proven recipe. The right-hand column is the same measure for the top creator; on narrow screens it drops to a grey line under each value.">
            Chart veterans (30d+)
          </Label>
          <div className={vt2 && benchmark ? PAIR_GRID_3 : PAIR_GRID_2}>
            {vt2 && benchmark && <PairHeader you={author} top={benchmark.author} />}

            <RowLabel>Holding 30d+</RowLabel>
            <YouCell>
              {vt.count === 0 ? (
                <span className="text-gray-400 dark:text-gray-500">
                  none past {vt.thresholdDays} days yet
                </span>
              ) : (
                <>
                  <span
                    className="cursor-help border-b border-dotted border-gray-300 dark:border-gray-600"
                    title={vt.names.join('\n')}
                  >
                    <b className="tabular-nums">{vt.count}</b> pack{vt.count !== 1 ? 's' : ''}
                  </span>
                  {vt.multiMarket > 0 && (
                    <span className="text-gray-400 dark:text-gray-500"> · {vt.multiMarket} in 2+ markets</span>
                  )}
                </>
              )}
            </YouCell>
            {vt2 && benchmark && (
              <TopCell author={benchmark.author}>
                <span
                  className="cursor-help border-b border-dotted border-gray-200 dark:border-gray-700"
                  title={vt2.names.length ? vt2.names.join('\n') : 'No veteran packs'}
                >
                  <b className="tabular-nums">{vt2.count}</b> pack{vt2.count !== 1 ? 's' : ''}
                </span>
                {' · '}
                {vt2.multiMarket} in 2+ markets
              </TopCell>
            )}

            {vt.longest && (
              <>
                <RowLabel>Longest run</RowLabel>
                <YouCell>
                  {vt.longest.packs.length === 1 ? (
                    <a
                      href={`/sticker/${vt.longest.packs[0].id}`}
                      className="hover:text-green-600 dark:hover:text-green-400"
                    >
                      {vt.longest.packs[0].name}
                    </a>
                  ) : (
                    // Several packs were already charting when our data begins — naming one as
                    // "the longest" would invent an order the data cannot support.
                    <span
                      className="cursor-help border-b border-dotted border-gray-300 dark:border-gray-600"
                      title={`${vt.longest.packs.map((p) => p.name).join('\n')}${vt.longest.openEnded ? '\n\nAll already charting when our data begins — the real runs are longer' : ''}`}
                    >
                      {vt.longest.packs.length} tied
                    </span>
                  )}{' '}
                  <b
                    className="tabular-nums whitespace-nowrap"
                    title={vt.longest.openEnded ? 'Since our data begins — the real run is longer' : undefined}
                  >
                    {vt.longest.openEnded ? '≥' : ''}
                    {vt.longest.days} days
                  </b>
                </YouCell>
                {vt2 && benchmark && (
                  <TopCell author={benchmark.author}>
                    {vt2.longest ? (
                      <>
                        {vt2.longest.packs.length === 1 ? (
                          <a
                            href={`/sticker/${vt2.longest.packs[0].id}`}
                            className="hover:text-green-600 dark:hover:text-green-400"
                          >
                            {vt2.longest.packs[0].name}
                          </a>
                        ) : (
                          <span
                            className="cursor-help border-b border-dotted border-gray-200 dark:border-gray-700"
                            title={vt2.longest.packs.map((p) => p.name).join('\n')}
                          >
                            {vt2.longest.packs.length} tied
                          </span>
                        )}{' '}
                        <b className="tabular-nums whitespace-nowrap">
                          {vt2.longest.openEnded ? '≥' : ''}
                          {vt2.longest.days} days
                        </b>
                      </>
                    ) : (
                      'no veteran packs'
                    )}
                  </TopCell>
                )}
              </>
            )}

            {vt.traits.length > 0 && (
              <>
                <RowLabel>They share</RowLabel>
                <YouCell>
                  <span
                    className="text-gray-600 dark:text-gray-300"
                    title="Descriptive, not causal — what the veteran packs have in common"
                  >
                    {vt.traits.join(' · ')}
                  </span>
                </YouCell>
                {vt2 && benchmark && (
                  <TopCell author={benchmark.author}>
                    <span title="What the top creator's veteran packs have in common">
                      {vt2.traits.length ? vt2.traits.join(' · ') : '—'}
                    </span>
                  </TopCell>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <section>
        <Label help="What each creator makes, across every pack of theirs we track (each has charted at least once). Character labels come from an image model and only labelled packs count toward the character split — hover any value for the pack count behind it. The right-hand column is the top creator's catalogue; on narrow screens it drops to a grey line under each value.">
          Catalogue
        </Label>
        <div className={benchmark ? PAIR_GRID_3 : PAIR_GRID_2}>
          {benchmark && <PairHeader you={author} top={benchmark.author} />}

          <RowLabel>Formats</RowLabel>
          <YouCell>
            {a.formats.map((f, i) => (
              <span key={f.key} title={`${f.count} of ${a.totalPacks} packs`}>
                {i > 0 && ' · '}
                {f.label} <b className="tabular-nums">{f.pct}%</b>
              </span>
            ))}
          </YouCell>
          {benchmark && (
            <TopCell author={benchmark.author}>
              {benchmark.analysis.formats.map((f, i) => (
                <span key={f.key} title={`${f.count} of ${benchmark.analysis.totalPacks} packs`}>
                  {i > 0 && ' · '}
                  {f.label} <b className="tabular-nums">{f.pct}%</b>
                </span>
              ))}
            </TopCell>
          )}

          {a.characters.length > 0 && (
            <>
              <RowLabel>Characters</RowLabel>
              <YouCell>
                {a.characters.map((c, i) => (
                  <span key={c.key} title={`${c.count} labelled packs`}>
                    {i > 0 && ' · '}
                    {c.label} <b className="tabular-nums">{c.pct}%</b>
                  </span>
                ))}
              </YouCell>
              {benchmark && (
                <TopCell author={benchmark.author}>
                  {benchmark.analysis.characters.length
                    ? benchmark.analysis.characters.map((c, i) => (
                        <span key={c.key} title={`${c.count} labelled packs`}>
                          {i > 0 && ' · '}
                          {c.label} <b className="tabular-nums">{c.pct}%</b>
                        </span>
                      ))
                    : 'not labelled yet'}
                </TopCell>
              )}
            </>
          )}

          <RowLabel>Numbered</RowLabel>
          <YouCell>
            <span title="Titles that read as a numbered instalment (Vol. 2, V.3, Part 4) — same definition as the insights page">
              <b className="tabular-nums">{a.sequelPct}%</b> of catalogue
            </span>
          </YouCell>
          {benchmark && (
            <TopCell author={benchmark.author}>
              <b className="tabular-nums">{benchmark.analysis.sequelPct}%</b> of catalogue
            </TopCell>
          )}

          {a.medianPrice != null && (
            <>
              <RowLabel>Median price</RowLabel>
              <YouCell>
                <span title="Median canonical USD price across packs with a known price">
                  <b className="tabular-nums">{usd(a.medianPrice)}</b>
                </span>
              </YouCell>
              {benchmark && (
                <TopCell author={benchmark.author}>
                  {benchmark.analysis.medianPrice != null ? (
                    <b className="tabular-nums">{usd(benchmark.analysis.medianPrice)}</b>
                  ) : (
                    '—'
                  )}
                </TopCell>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
