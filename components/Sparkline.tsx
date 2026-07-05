// Inline rank-history sparkline for homepage rows. Pure SVG, no deps, no data fetching — it draws
// the `ranks` array it's handed (daily points from the dashboard API, oldest→newest). Lower rank =
// better, so the line is inverted: an improving sticker rises. Area fill + an end dot + a tooltip
// make it readable at a glance; the caller shows a "7d" label so the window/resolution is explicit.
interface Props {
  ranks: number[];
  width?: number;
  height?: number;
}

export default function Sparkline({ ranks, width = 84, height = 28 }: Props) {
  // Need at least two points to draw a trend; otherwise render nothing (row still looks fine).
  if (!ranks || ranks.length < 2) {
    return <span style={{ display: 'inline-block', width, height }} aria-hidden="true" />;
  }

  const pad = 3;
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
  // Area polygon: the line, then down the right edge, along the bottom, back up the left edge.
  const area = `${line} ${last.x.toFixed(1)},${(height - pad).toFixed(1)} ${pad.toFixed(1)},${(height - pad).toFixed(1)}`;

  // Trend from first→last: improved (rank got smaller) = green, worse = red, flat = gray.
  const trend = ranks[ranks.length - 1] - ranks[0];
  const stroke = trend < 0 ? '#16a34a' : trend > 0 ? '#dc2626' : '#9ca3af';
  const fill = trend < 0 ? '#16a34a' : trend > 0 ? '#dc2626' : '#9ca3af';
  const trendWord = trend < 0 ? 'improving' : trend > 0 ? 'declining' : 'steady';
  const label = `Rank over the last 7 days (${trendWord})`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ display: 'block' }}
    >
      <title>{label}</title>
      <polygon points={area} fill={fill} fillOpacity={0.1} stroke="none" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
    </svg>
  );
}
