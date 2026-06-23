'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  snapshot_date: string;
  snapshot_hour: number;
  rank: number;
}

interface Props {
  data: DataPoint[];
  countryName: string;
  countryFlag: string;
}

function formatLabel(d: DataPoint) {
  const date = new Date(`${d.snapshot_date}T${String(d.snapshot_hour).padStart(2, '0')}:00:00Z`);
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

export default function RankGraph({ data, countryName, countryFlag }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No data available for this country
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: formatLabel(d),
    rank: d.rank,
    raw: d,
  }));

  const minRank = Math.min(...data.map((d) => d.rank));
  const maxRank = Math.max(...data.map((d) => d.rank));

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{countryFlag}</span>
        <div>
          <p className="font-semibold text-sm">{countryName}</p>
          <p className="text-xs text-gray-400">Last 30 days · Click a point for details</p>
        </div>
        {data.length > 1 && (
          <span
            className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
              data[data.length - 1].rank < data[0].rank
                ? 'bg-green-100 text-green-700'
                : data[data.length - 1].rank > data[0].rank
                ? 'bg-red-100 text-red-500'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {data[data.length - 1].rank < data[0].rank
              ? `↑ Up ${data[0].rank - data[data.length - 1].rank}`
              : data[data.length - 1].rank > data[0].rank
              ? `↓ Down ${data[data.length - 1].rank - data[0].rank}`
              : '— Flat'}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            reversed
            domain={[
              Math.max(1, minRank - 2),
              Math.min(50, maxRank + 2),
            ]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v) => `#${v}`}
            width={30}
          />
          <Tooltip
            formatter={(value) => [`#${value}`, 'Rank']}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          {minRank <= 3 && (
            <ReferenceLine y={minRank} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `Best #${minRank}`, fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }} />
          )}
          <Line
            type="monotone"
            dataKey="rank"
            stroke="#06c755"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#06c755', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#06c755' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
