// Inline rank-history sparkline for homepage rows. Pure SVG, no deps, no data fetching — it draws
// the `ranks` array it's handed (daily points from the dashboard API, oldest→newest). Lower rank =
// better, so the line is inverted: an improving sticker rises. Every data point gets a dot, and an
// invisible larger hit-circle carries a <title> so hovering a point shows that day's rank (native
// browser tooltip, no JS). The caller shows a "past 7 days" label so the window is explicit.
interface Props {
  ranks: number[];
  width?: number;
  height?: number;
}

export default function Sparkline({ ranks, width = 88, height = 30 }: Props) {
  // Need at least two points to draw a trend; otherwise render nothing (row still looks fine).
  if (!ranks || ranks.length < 2) {
    return <span style={{ display: 'inline-block', width, height }} aria-hidden="true" />;
  }

  const pad = 4;
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1; // avoid /0 when the rank never changed
  const stepX = (width - pad * 2) / (ranks.length - 1);

  // Best rank (smallest number) maps to the TOP of the box; worst to the bottom.
  const coords = ranks.map((r, i) => {
    const x = pad + i * stepX;
    const y = pad + ((r - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const first = coords[0];
  // Area polygon: the line, then down the right edge, along the bottom, back up the left edge.
  const area = `${line} ${last.x.toFixed(1)},${(height - pad).toFixed(1)} ${first.x.toFixed(1)},${(height - pad).toFixed(1)}`;

  // Trend from first→last: improved (rank got smaller) = green, worse = red, flat = gray.
  const trend = ranks[ranks.length - 1] - ranks[0];
  const stroke = trend < 0 ? '#16a34a' : trend > 0 ? '#dc2626' : '#9ca3af';
  const trendWord = trend < 0 ? 'improving' : trend > 0 ? 'declining' : 'steady';
  const label = `Rank over the last 7 days (${trendWord})`;
  const hitR = Math.min(6, Math.max(4, stepX / 2));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>{label}</title>
      <polygon points={area} fill={stroke} fillOpacity={0.1} stroke="none" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.6 : 2} fill={stroke} stroke="#fff" strokeWidth={0.75} />
          {/* Bigger invisible target so the tooltip is easy to trigger on hover/tap. */}
          <circle cx={c.x} cy={c.y} r={hitR} fill="transparent" style={{ cursor: 'pointer' }}>
            <title>Rank #{ranks[i]}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
