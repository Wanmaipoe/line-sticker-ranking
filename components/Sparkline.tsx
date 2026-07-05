// Tiny inline rank-history sparkline for homepage rows. Pure SVG, no deps, no data fetching —
// it just draws the `ranks` array it's handed (already downsampled to daily points by the
// dashboard API). Lower rank = better, so the line is inverted: an improving sticker rises.
interface Props {
  ranks: number[];
  width?: number;
  height?: number;
}

export default function Sparkline({ ranks, width = 56, height = 16 }: Props) {
  // Need at least two points to draw a trend; otherwise render nothing (row still looks fine).
  if (!ranks || ranks.length < 2) {
    return <span style={{ display: 'inline-block', width, height }} aria-hidden="true" />;
  }

  const pad = 2;
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const span = max - min || 1; // avoid /0 when the rank never changed
  const stepX = (width - pad * 2) / (ranks.length - 1);

  // Best rank (smallest number) maps to the TOP of the box; worst to the bottom.
  const points = ranks
    .map((r, i) => {
      const x = pad + i * stepX;
      const y = pad + ((r - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Trend color from first→last: improved (rank got smaller) = green, worse = red, flat = gray.
  const trend = ranks[ranks.length - 1] - ranks[0];
  const stroke = trend < 0 ? '#16a34a' : trend > 0 ? '#dc2626' : '#9ca3af';
  const trendWord = trend < 0 ? 'improving' : trend > 0 ? 'declining' : 'steady';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-label={`Recent rank trend: ${trendWord}`}
      style={{ display: 'block' }}
    >
      <polyline points={points} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
